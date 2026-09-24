import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractUrls, normalizeUrl } from '../src/url.js';
import { withStatus, withFields, sortJobs } from '../src/jobs.js';

test('extracts multiple URLs, one per line or mixed with text', () => {
  const text = `https://a.com/jobs/1
  check this: https://b.com/x?id=2).
  boards.greenhouse.io/acme/jobs/3`;
  assert.deepEqual(extractUrls(text), ['https://a.com/jobs/1', 'https://b.com/x?id=2']);
  assert.deepEqual(extractUrls('boards.greenhouse.io/acme/jobs/3'), ['https://boards.greenhouse.io/acme/jobs/3']);
  assert.deepEqual(extractUrls('no links here'), []);
});

test('normalizes tracking params, hash, www, trailing slash; keeps job ids', () => {
  const a = normalizeUrl('https://www.LinkedIn.com/jobs/view/123/?refId=x&trackingId=y&utm_source=z#top');
  const b = normalizeUrl('http://linkedin.com/jobs/view/123');
  assert.equal(a, 'https://linkedin.com/jobs/view/123');
  assert.equal(a, b);
  assert.equal(
    normalizeUrl('https://www.indeed.com/viewjob?jk=abc&from=serp&vjs=3'),
    'https://indeed.com/viewjob?jk=abc&vjs=3'
  );
  assert.equal(
    normalizeUrl('https://boards.greenhouse.io/acme?gh_jid=42&gh_src=foo'),
    'https://boards.greenhouse.io/acme?gh_jid=42&gh_src=foo'
  );
  assert.equal(normalizeUrl('not a url'), null);
  assert.equal(normalizeUrl('javascript:alert(1)'), null);
});

test('status transitions stamp and clear appliedAt', () => {
  const job = { id: '1', status: 'saved', appliedAt: null, createdAt: '2026-01-01T00:00:00Z' };
  const applied = withStatus(job, 'applied');
  assert.match(applied.appliedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(withStatus(applied, 'saved').appliedAt, null);
  assert.equal(withFields(applied, { appliedAt: '2026-02-03' }).appliedAt, '2026-02-03');
  assert.equal(withFields(applied, { appliedAt: 'garbage' }).appliedAt, null);
});

test('sorts unfinished first, then newest', () => {
  const jobs = [
    { id: 'a', status: 'applied', createdAt: '2026-03-01' },
    { id: 'b', status: 'saved', createdAt: '2026-01-01' },
    { id: 'c', status: 'saved', createdAt: '2026-02-01' },
    { id: 'd', status: 'skipped', createdAt: '2026-04-01' },
  ];
  assert.deepEqual(sortJobs(jobs, 'all').map((j) => j.id), ['c', 'b', 'a', 'd']);
});
