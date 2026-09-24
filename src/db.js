// Persistence layer. Everything storage-specific lives here so a future move to
// a hosted database only has to replace this module's exported functions.

const DB_NAME = 'job-tracker';
const DB_VERSION = 1;
const STORE = 'jobs';

let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('url', 'url', { unique: true });
        store.createIndex('status', 'status');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let result;
    Promise.resolve(fn(store)).then((r) => (result = r), reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function getAllJobs() {
  return tx('readonly', (s) => reqP(s.getAll()));
}

export function findByUrl(url) {
  return tx('readonly', (s) => reqP(s.index('url').get(url)));
}

export function putJob(job) {
  return tx('readwrite', (s) => reqP(s.put(job)).then(() => job));
}

export function deleteJob(id) {
  return tx('readwrite', (s) => reqP(s.delete(id)));
}

/**
 * Upsert many jobs in one transaction. Same id → overwritten (restore);
 * URL already saved under a different id → skipped.
 */
export function importJobs(jobs) {
  return tx('readwrite', async (s) => {
    let added = 0;
    let updated = 0;
    let skipped = 0;
    for (const job of jobs) {
      const existing = await reqP(s.index('url').get(job.url));
      if (existing && existing.id !== job.id) {
        skipped++;
        continue;
      }
      if (!existing && (await reqP(s.get(job.id)))) updated++;
      else if (existing) updated++;
      else added++;
      await reqP(s.put(job));
    }
    return { added, updated, skipped };
  });
}
