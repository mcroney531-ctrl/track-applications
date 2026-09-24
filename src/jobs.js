// Job model + domain rules. No DOM, no storage.

export const STATUSES = ['saved', 'applied', 'skipped', 'closed'];

export const STATUS_LABEL = {
  saved: 'To apply',
  applied: 'Applied',
  skipped: 'Skipped',
  closed: 'Closed',
};

export function todayLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function cleanText(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

export function createJob(url, { title = null, company = null, source = null, externalId = null } = {}) {
  return {
    id: uuid(),
    url,
    company: cleanText(company),
    title: cleanText(title),
    status: 'saved',
    createdAt: new Date().toISOString(),
    appliedAt: null,
    notes: null,
    source: cleanText(source),
    externalId: cleanText(externalId),
  };
}

/** Returns a new job with the status changed, applying the appliedAt rules. */
export function withStatus(job, status) {
  const next = { ...job, status };
  if (status === 'applied' && !job.appliedAt) next.appliedAt = todayLocal();
  if (status === 'saved') next.appliedAt = null;
  return next;
}

export function withFields(job, fields) {
  const next = { ...job };
  for (const key of ['company', 'title', 'notes']) {
    if (key in fields) next[key] = cleanText(fields[key]);
  }
  if ('appliedAt' in fields) {
    const v = cleanText(fields.appliedAt);
    next.appliedAt = v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  }
  return next;
}

/** Validate/coerce one record from an import file. Returns null if unusable. */
export function coerceImported(raw, normalizeUrl) {
  if (!raw || typeof raw !== 'object') return null;
  const url = normalizeUrl(raw.url);
  if (!url) return null;
  const status = STATUSES.includes(raw.status) ? raw.status : 'saved';
  const created = Date.parse(raw.createdAt);
  const job = {
    id: cleanText(raw.id) || uuid(),
    url,
    company: cleanText(raw.company),
    title: cleanText(raw.title),
    status,
    createdAt: Number.isNaN(created) ? new Date().toISOString() : new Date(created).toISOString(),
    appliedAt: null,
    notes: cleanText(raw.notes),
    source: cleanText(raw.source),
    externalId: cleanText(raw.externalId),
  };
  return withFields(job, { appliedAt: raw.appliedAt });
}

const RANK = { saved: 0, applied: 1, skipped: 2, closed: 3 };

export function sortJobs(jobs, filter) {
  return [...jobs].sort((a, b) => {
    if (filter === 'applied') {
      const d = (b.appliedAt || '').localeCompare(a.appliedAt || '');
      if (d) return d;
    } else if (RANK[a.status] !== RANK[b.status]) {
      return RANK[a.status] - RANK[b.status];
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function matchesFilter(job, filter) {
  if (filter === 'todo') return job.status === 'saved';
  if (filter === 'applied') return job.status === 'applied';
  return true;
}
