import { extractUrls, normalizeUrl, hostOf } from './url.js';
import * as db from './db.js';
import {
  STATUSES, STATUS_LABEL, createJob, withStatus, withFields,
  coerceImported, sortJobs, matchesFilter,
} from './jobs.js';

const state = {
  jobs: [],
  filter: 'todo',
  query: '',
  expandedId: null,
};

const $ = (sel) => document.querySelector(sel);
const listEl = $('#list');
const emptyEl = $('#empty');
const input = $('#capture-input');
const searchEl = $('#search');

// ---------- helpers ----------

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function byId(id) {
  return state.jobs.find((j) => j.id === id);
}

function replaceJob(job) {
  const i = state.jobs.findIndex((j) => j.id === job.id);
  if (i >= 0) state.jobs[i] = job;
  else state.jobs.push(job);
}

function shortDate(ymd) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const sameYear = y === new Date().getFullYear();
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

function ago(iso) {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  if (days <= 0) return 'Saved today';
  if (days === 1) return 'Saved yesterday';
  if (days < 30) return `Saved ${days}d ago`;
  return 'Saved ' + new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

let persistRequested = false;
function requestPersistentStorage() {
  if (persistRequested || !navigator.storage?.persist) return;
  persistRequested = true;
  navigator.storage.persist().catch(() => {});
}

// ---------- toast ----------

let toastTimer;
function toast(msg, action) {
  const el = $('#toast');
  const btn = $('#toast-action');
  $('#toast-msg').textContent = msg;
  if (action) {
    btn.textContent = action.label;
    btn.hidden = false;
    btn.onclick = () => {
      hideToast();
      action.run();
    };
  } else {
    btn.hidden = true;
    btn.onclick = null;
  }
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 5000 : 2600);
}

function hideToast() {
  const el = $('#toast');
  el.classList.remove('show');
  setTimeout(() => { if (!el.classList.contains('show')) el.hidden = true; }, 200);
}

// ---------- rendering ----------

function visibleJobs() {
  const q = state.query.trim().toLowerCase();
  const filtered = state.jobs.filter((j) => {
    if (!matchesFilter(j, state.filter)) return false;
    if (!q) return true;
    return [j.title, j.company, hostOf(j.url)].some((f) => f && f.toLowerCase().includes(q));
  });
  return sortJobs(filtered, state.filter);
}

function statusSelect(job) {
  const opts = STATUSES.map(
    (s) => `<option value="${s}"${s === job.status ? ' selected' : ''}>${STATUS_LABEL[s]}</option>`
  ).join('');
  return `<select class="status status-${job.status}" data-act="status" aria-label="Status">${opts}</select>`;
}

function jobHtml(job) {
  const expanded = state.expandedId === job.id;
  const host = hostOf(job.url);
  const title = job.title
    ? `<span class="job-title">${esc(job.title)}</span>`
    : `<span class="job-title unset">Untitled job</span>`;
  const company = job.company
    ? `<span class="company">${esc(job.company)}</span>`
    : `<span class="company unset">Company not set</span>`;

  let actions = statusSelect(job);
  if (job.status === 'saved') {
    actions += `<button class="btn applied-btn" data-act="apply">Mark applied</button>`;
  } else if (job.status === 'applied') {
    actions += `<label class="date-chip"><span class="sr">Applied on</span>
      <input type="date" data-act="applied-date" value="${esc(job.appliedAt || '')}" aria-label="Applied date" />
      <span class="date-text">${job.appliedAt ? esc(shortDate(job.appliedAt)) : 'Set date'}</span></label>`;
  }

  const notes = job.notes && !expanded ? `<p class="note-preview">${esc(job.notes)}</p>` : '';

  const edit = expanded
    ? `<div class="edit">
        <label>Job title<input data-field="title" value="${esc(job.title || '')}" placeholder="e.g. Product Designer" enterkeyhint="next" /></label>
        <label>Company<input data-field="company" value="${esc(job.company || '')}" placeholder="e.g. Acme" enterkeyhint="done" /></label>
        <label>Notes<textarea data-field="notes" rows="2" placeholder="Optional">${esc(job.notes || '')}</textarea></label>
        <div class="edit-foot">
          <button class="link danger" data-act="delete">Delete</button>
          <span class="muted small url-line" title="${esc(job.url)}">${esc(job.url)}</span>
          <button class="btn" data-act="done">Done</button>
        </div>
      </div>`
    : '';

  return `<li class="job s-${job.status}${expanded ? ' expanded' : ''}" data-id="${esc(job.id)}">
    <div class="job-main">
      <button class="job-body" data-act="toggle" aria-expanded="${expanded}">
        ${title}
        <span class="meta">${company}<span class="dot">·</span><span class="host">${esc(host)}</span></span>
      </button>
      <a class="icon-btn open" href="${esc(job.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open posting">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4"/></svg>
      </a>
    </div>
    ${notes}
    <div class="job-actions">${actions}<span class="ago">${esc(ago(job.createdAt))}</span></div>
    ${edit}
  </li>`;
}

function emptyMessage() {
  if (state.query.trim()) return `No matches for “${esc(state.query.trim())}”.`;
  if (!state.jobs.length) return `<strong>Nothing saved yet.</strong><br/>Paste a job link above, or share one to this app from your browser.`;
  if (state.filter === 'todo') return `<strong>You're caught up.</strong><br/>Nothing left to apply to.`;
  if (state.filter === 'applied') return `No applications marked yet.`;
  return `Nothing here.`;
}

function render() {
  const jobs = visibleJobs();
  listEl.innerHTML = jobs.map(jobHtml).join('');
  emptyEl.hidden = jobs.length > 0;
  if (!jobs.length) emptyEl.innerHTML = emptyMessage();

  const counts = {
    todo: state.jobs.filter((j) => j.status === 'saved').length,
    applied: state.jobs.filter((j) => j.status === 'applied').length,
    all: state.jobs.length,
  };
  document.querySelectorAll('[data-count]').forEach((el) => {
    el.textContent = counts[el.dataset.count] || '';
  });
  document.querySelectorAll('[data-filter]').forEach((el) => {
    el.setAttribute('aria-selected', String(el.dataset.filter === state.filter));
  });
}

function setFilter(filter) {
  state.filter = filter;
  try { localStorage.setItem('jt-filter', filter); } catch {}
  render();
}

/** Make sure a job is visible (adjust filter/search if needed), then flash it. */
function reveal(id) {
  const job = byId(id);
  if (!job) return;
  if (!visibleJobs().some((j) => j.id === id)) {
    state.query = '';
    searchEl.value = '';
    state.filter = matchesFilter(job, 'todo') ? 'todo' : job.status === 'applied' ? 'applied' : 'all';
  }
  render();
  const el = listEl.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (el) {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }
}

// ---------- capture ----------

/**
 * Save every URL found in `text`. `meta` (title/company/source) is applied only
 * when exactly one URL is being saved.
 */
async function capture(text, meta = {}) {
  const urls = [...new Set(extractUrls(text).map(normalizeUrl).filter(Boolean))];
  if (!urls.length) {
    toast('No link found');
    return { added: [], dupes: [] };
  }

  const added = [];
  const dupes = [];
  for (const url of urls) {
    const existing = state.jobs.find((j) => j.url === url) || (await db.findByUrl(url));
    if (existing) {
      dupes.push(existing);
      continue;
    }
    const job = createJob(url, urls.length === 1 ? meta : { source: meta.source });
    try {
      await db.putJob(job);
      state.jobs.push(job);
      added.push(job);
    } catch (err) {
      // Unique index on url rejected it (e.g. saved from another tab).
      const again = await db.findByUrl(url);
      if (again) { replaceJob(again); dupes.push(again); } else throw err;
    }
  }

  if (added.length) requestPersistentStorage();
  if (added.length && state.filter === 'applied') state.filter = 'todo';

  if (added.length === 1 && !dupes.length) {
    toast('Saved');
    reveal(added[0].id);
  } else if (!added.length && dupes.length === 1) {
    toast('Already saved');
    reveal(dupes[0].id);
  } else {
    const parts = [];
    if (added.length) parts.push(`Saved ${added.length}`);
    if (dupes.length) parts.push(`${dupes.length} already saved`);
    toast(parts.join(' · '));
    render();
  }
  return { added, dupes };
}

function autosize() {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 160) + 'px';
}

$('#capture').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value;
  if (!text.trim()) { input.focus(); return; }
  const { added, dupes } = await capture(text);
  if (added.length || dupes.length) {
    input.value = '';
    autosize();
  }
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $('#capture').requestSubmit();
  }
});
input.addEventListener('input', autosize);

// ---------- share target ----------

async function handleShare() {
  const params = new URLSearchParams(location.search);
  const sharedUrl = params.get('url') || '';
  const sharedText = params.get('text') || '';
  const sharedTitle = params.get('title') || '';
  if (!sharedUrl && !sharedText && !sharedTitle) return;

  // Clean the address bar so a reload doesn't re-share.
  history.replaceState(null, '', location.pathname);

  // Android often puts the link inside `text`; some apps put it in `title`.
  let urls = extractUrls(sharedUrl);
  if (!urls.length) urls = extractUrls(sharedText);
  if (!urls.length) urls = extractUrls(sharedTitle);
  if (!urls.length) { toast('No link found in shared content'); return; }

  // Opportunistic title: whatever human text came with the share, minus URLs.
  const strip = (s) => s.replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim();
  const titleGuess = (strip(sharedTitle) || strip(sharedText)).slice(0, 160) || null;

  const { added, dupes } = await capture(urls.join('\n'), { title: titleGuess, source: 'share' });
  const target = added[0] || dupes[0];
  if (added.length === 1) {
    state.expandedId = target.id;
    reveal(target.id);
    toast('Saved. Add details or leave it.');
  }
}

// ---------- list interactions ----------

async function updateJob(job, { rerender = true } = {}) {
  replaceJob(job);
  await db.putJob(job);
  if (rerender) render();
}

async function changeStatus(id, status) {
  const prev = byId(id);
  if (!prev || prev.status === status) return;
  await updateJob(withStatus(prev, status));
  const msg = status === 'applied' ? 'Marked applied' : `Marked ${STATUS_LABEL[status].toLowerCase()}`;
  toast(msg, { label: 'Undo', run: () => updateJob(prev) });
}

listEl.addEventListener('click', async (e) => {
  const actEl = e.target.closest('[data-act]');
  const li = e.target.closest('.job');
  if (!actEl || !li) return;
  const id = li.dataset.id;
  const act = actEl.dataset.act;

  if (act === 'toggle' || act === 'done') {
    state.expandedId = state.expandedId === id ? null : id;
    render();
    if (state.expandedId) {
      const first = listEl.querySelector(`[data-id="${CSS.escape(id)}"] [data-field="title"]`);
      if (first && !byId(id).title && matchMedia('(pointer: fine)').matches) first.focus();
    }
  } else if (act === 'apply') {
    await changeStatus(id, 'applied');
  } else if (act === 'delete') {
    const job = byId(id);
    state.jobs = state.jobs.filter((j) => j.id !== id);
    state.expandedId = null;
    await db.deleteJob(id);
    render();
    toast('Deleted', { label: 'Undo', run: () => updateJob(job) });
  }
});

listEl.addEventListener('change', async (e) => {
  const li = e.target.closest('.job');
  if (!li) return;
  const id = li.dataset.id;
  const act = e.target.dataset.act;
  if (act === 'status') {
    await changeStatus(id, e.target.value);
  } else if (act === 'applied-date') {
    await updateJob(withFields(byId(id), { appliedAt: e.target.value }));
  }
});

// Inline text fields: persist as you type, update the card header in place
// (no re-render, so focus/caret are preserved).
const pending = new Map();
listEl.addEventListener('input', (e) => {
  const field = e.target.dataset.field;
  const li = e.target.closest('.job');
  if (!field || !li) return;
  const id = li.dataset.id;
  const job = withFields(byId(id), { [field]: e.target.value });
  replaceJob(job);

  if (field === 'title' || field === 'company') {
    const cls = field === 'title' ? '.job-title' : '.company';
    const el = li.querySelector(cls);
    el.textContent = job[field] || (field === 'title' ? 'Untitled job' : 'Company not set');
    el.classList.toggle('unset', !job[field]);
  }

  clearTimeout(pending.get(id));
  pending.set(id, setTimeout(() => { pending.delete(id); db.putJob(byId(id)); }, 300));
});

listEl.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || !e.target.dataset.field) return;
  e.preventDefault();
  if (e.target.dataset.field === 'title') {
    e.target.closest('.edit').querySelector('[data-field="company"]').focus();
  } else {
    e.target.blur();
  }
});

// Flush unsaved edits if the app is backgrounded.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden') return;
  for (const [id, t] of pending) {
    clearTimeout(t);
    db.putJob(byId(id));
  }
  pending.clear();
});

// ---------- filters & search ----------

document.querySelector('.tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-filter]');
  if (btn) setFilter(btn.dataset.filter);
});

searchEl.addEventListener('input', () => {
  state.query = searchEl.value;
  render();
});

// ---------- settings: export / import / install ----------

const settings = $('#settings');
$('#menu-btn').addEventListener('click', () => {
  const by = (s) => state.jobs.filter((j) => j.status === s).length;
  $('#stats').textContent =
    `${state.jobs.length} saved · ${by('saved')} to apply · ${by('applied')} applied · ${by('skipped')} skipped · ${by('closed')} closed`;
  settings.showModal();
});
settings.addEventListener('click', (e) => {
  if (e.target === settings) settings.close();
});

$('#export-btn').addEventListener('click', () => {
  const data = {
    app: 'job-tracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    jobs: sortJobs(state.jobs, 'all'),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `job-tracker-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`Exported ${state.jobs.length} jobs`);
});

$('#import-btn').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const rows = Array.isArray(parsed) ? parsed : parsed.jobs;
    if (!Array.isArray(rows)) throw new Error('No jobs array');
    const jobs = rows.map((r) => coerceImported(r, normalizeUrl)).filter(Boolean);
    const invalid = rows.length - jobs.length;
    const { added, updated, skipped } = await db.importJobs(jobs);
    state.jobs = await db.getAllJobs();
    render();
    settings.close();
    const parts = [`Imported ${added} new`];
    if (updated) parts.push(`${updated} restored`);
    if (skipped) parts.push(`${skipped} duplicate${skipped === 1 ? '' : 's'} skipped`);
    if (invalid) parts.push(`${invalid} invalid`);
    toast(parts.join(' · '));
  } catch {
    toast("Couldn't read that file");
  }
});

let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  $('#install-btn').hidden = false;
});
$('#install-btn').addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $('#install-btn').hidden = true;
});

// ---------- boot ----------

async function boot() {
  try {
    const saved = localStorage.getItem('jt-filter');
    if (['todo', 'applied', 'all'].includes(saved)) state.filter = saved;
  } catch {}
  state.jobs = await db.getAllJobs();
  render();
  await handleShare();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
