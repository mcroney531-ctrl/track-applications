// URL extraction + normalization. Deliberately small: strip common tracking
// params, keep everything else (job boards often put the job id in the query).

const TRACKING_PARAMS = new Set([
  'gclid', 'fbclid', 'msclkid', 'dclid', 'mc_cid', 'mc_eid', '_hsenc', '_hsmi',
  'ref', 'referrer', 'refid', 'trackingid', 'trk', 'trkinfo', 'lipi', 'ebp',
  'originalsubdomain', 'src', 'from', 'share', 'shared', 'sharesource',
  'igshid', 'si', 'cmp', 'campaignid', 'source',
]);

const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
const BARE_RE = /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/?#][^\s]*)?$/i;

function trimTrailing(u) {
  // Drop punctuation that commonly trails a pasted/shared link.
  return u.replace(/[)\].,;:!?'"]+$/, '');
}

/** Pull every http(s) URL out of arbitrary text (one per line, or mixed prose). */
export function extractUrls(text) {
  if (!text) return [];
  const found = (String(text).match(URL_RE) || []).map(trimTrailing);
  if (found.length) return found;
  // Allow scheme-less links like "boards.greenhouse.io/acme/jobs/123".
  return String(text)
    .split(/\s+/)
    .filter((t) => BARE_RE.test(t))
    .map((t) => 'https://' + trimTrailing(t));
}

/** Canonical form used for storage and duplicate checks. Returns null if invalid. */
export function normalizeUrl(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

  u.protocol = 'https:';
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
  u.hash = '';
  u.username = '';
  u.password = '';

  const kept = [...u.searchParams.entries()]
    .filter(([k]) => {
      const key = k.toLowerCase();
      return !key.startsWith('utm_') && !TRACKING_PARAMS.has(key);
    })
    .sort(([a], [b]) => a.localeCompare(b));
  u.search = new URLSearchParams(kept).toString();

  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
  return u.toString();
}

export function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
