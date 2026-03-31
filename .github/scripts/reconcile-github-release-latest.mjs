#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import { selectLatestPublishedReleaseEntry } from '../../lib/githubRelease.ts';

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }

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

  if (init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(
      `GitHub request failed with ${response.status} for ${url}${details ? `: ${details}` : ''}`
    );
  }

  return response.json();
}

export function resolveLatestPublishedReleaseId(releases) {
  if (!Array.isArray(releases)) {
    return null;
  }

  const release = selectLatestPublishedReleaseEntry(releases);
  if (!release) {
    return null;
  }

  const id =
    typeof release.id === 'number' && Number.isFinite(release.id)
      ? release.id
      : typeof release.id === 'string' && /^\d+$/.test(release.id.trim())
        ? Number(release.id.trim())
        : null;

  if (!id) {
    return null;
  }

  const tagName = typeof release.tag_name === 'string' ? release.tag_name.trim() : '';
  if (!tagName) {
    return null;
  }

  return {
    id,
    tagName,
  };
}

export async function main() {
  const token = requireEnv('GITHUB_TOKEN');
  const repository = requireEnv('REPOSITORY');
  const apiUrl = `https://api.github.com/repos/${repository}`;
  const releases = await requestJson(`${apiUrl}/releases?per_page=100`, token);
  const latest = resolveLatestPublishedReleaseId(releases);

  if (!latest) {
    console.log('No published GitHub release found to mark as latest.');
    return;
  }

  await requestJson(`${apiUrl}/releases/${latest.id}`, token, {
    method: 'PATCH',
    body: JSON.stringify({
      make_latest: 'true',
    }),
  });

  console.log(`Marked ${latest.tagName} as the latest GitHub release.`);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
