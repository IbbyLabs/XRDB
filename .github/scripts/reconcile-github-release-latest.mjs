#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

function normalizeReleaseTag(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseReleaseVersionParts(tagName) {
  const normalized = normalizeReleaseTag(tagName);
  if (!normalized) return null;
  const coreVersion = normalized.replace(/^v/i, '').split(/[+-]/, 1)[0];
  if (!coreVersion) return null;
  const parts = coreVersion.split('.');
  if (!parts.length || parts.some((p) => !/^\d+$/.test(p))) return null;
  return parts.map(Number);
}

function compareReleaseTagVersions(left, right) {
  const lp = parseReleaseVersionParts(left);
  const rp = parseReleaseVersionParts(right);
  if (lp && rp) {
    const max = Math.max(lp.length, rp.length);
    for (let i = 0; i < max; i++) {
      const diff = (lp[i] ?? 0) - (rp[i] ?? 0);
      if (diff !== 0) return diff;
    }
  } else if (lp || rp) {
    return lp ? 1 : -1;
  }
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });
}

function parsePublishedTimestamp(value) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

function normalizePublishedAt(value) {
  return typeof value === 'string' ? value.trim() || null : null;
}

function parseReleaseId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  return Number.NEGATIVE_INFINITY;
}

function isPublishedReleaseEntry(entry) {
  return entry?.draft !== true && entry?.prerelease !== true && Boolean(normalizeReleaseTag(entry.tag_name));
}

function selectLatestPublishedReleaseEntry(payload) {
  const releases = payload.filter(isPublishedReleaseEntry);
  if (!releases.length) return null;
  releases.sort((a, b) => {
    const vd = compareReleaseTagVersions(normalizeReleaseTag(a.tag_name) || '', normalizeReleaseTag(b.tag_name) || '');
    if (vd !== 0) return vd;
    const pd = parsePublishedTimestamp(normalizePublishedAt(a.published_at)) - parsePublishedTimestamp(normalizePublishedAt(b.published_at));
    if (pd !== 0) return pd;
    return parseReleaseId(a.id) - parseReleaseId(b.id);
  });
  return releases.at(-1) ?? null;
}

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function requestJson(url, token, init = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'User-Agent': 'xrdb/reconcile-release-latest',
    'X-GitHub-Api-Version': '2022-11-28',
    ...init.headers,
  };
  if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`GitHub request failed with ${response.status} for ${url}${details ? `: ${details}` : ''}`);
  }
  return response.json();
}

export function resolveLatestPublishedReleaseId(releases) {
  if (!Array.isArray(releases)) return null;
  const release = selectLatestPublishedReleaseEntry(releases);
  if (!release) return null;
  const id = parseReleaseId(release.id);
  if (!id || id === Number.NEGATIVE_INFINITY) return null;
  const tagName = typeof release.tag_name === 'string' ? release.tag_name.trim() : '';
  if (!tagName) return null;
  return { id, tagName };
}

export async function main() {
  const token = requireEnv('GITHUB_TOKEN');
  const repository = requireEnv('REPOSITORY');
  const currentTag = String(process.env.CURRENT_TAG || '').trim();
  const apiUrl = `https://api.github.com/repos/${repository}`;
  const releases = await requestJson(`${apiUrl}/releases?per_page=100`, token);
  let allReleases = Array.isArray(releases) ? releases : [];
  if (currentTag) {
    try {
      const tagRelease = await requestJson(`${apiUrl}/releases/tags/${encodeURIComponent(currentTag)}`, token);
      if (tagRelease && typeof tagRelease.id !== 'undefined' && !allReleases.some((r) => r.id === tagRelease.id)) {
        allReleases = [...allReleases, tagRelease];
      }
    } catch {
      // Tag release may not exist yet; fall back to the list already fetched.
    }
  }
  const latest = resolveLatestPublishedReleaseId(allReleases);
  if (!latest) {
    console.log('No published GitHub release found to mark as latest.');
    return;
  }
  await requestJson(`${apiUrl}/releases/${latest.id}`, token, { method: 'PATCH', body: JSON.stringify({ make_latest: 'true' }) });
  console.log(`Marked ${latest.tagName} as the latest GitHub release.`);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
