#!/usr/bin/env node

import { buildDiscordReleasePayloads, resolveDiscordWebhookPostUrl } from './post-discord-release.mjs';
import { pathToFileURL } from 'node:url';

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function normalizeSummary(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

// Trailer lines are published verbatim by this notifier, so they are dropped
// before the body is split into paragraphs.
//
// ATTRIBUTION mirrors PATTERN in attribution-scan.yml. That scan gates new
// commits; this gates a backfill dispatched at a ref from before it existed,
// where nothing else applies. The two must move together.
export const ATTRIBUTION = /claude[-_ ]?session|claude\.ai\/(code\/)?session|co-authored-by:\s*claude|generated with .*claude/i;
const DROPPED_TRAILER = /^(?:co-authored-by|signed-off-by)\s*:/i;

export function stripPublishedTrailers(message) {
  return String(message || '')
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return !ATTRIBUTION.test(trimmed) && !DROPPED_TRAILER.test(trimmed);
    })
    .join('\n');
}

function classifyCommit(subject) {
  const normalized = normalizeSummary(subject).toLowerCase();
  if (normalized.startsWith('feat:') || normalized.startsWith('feat(')) {
    return 'Added';
  }
  if (normalized.startsWith('fix:') || normalized.startsWith('fix(')) {
    return 'Fixed';
  }
  return 'Changed';
}

function toDetailedItem(commit) {
  const subject = normalizeSummary(commit?.commit?.message?.split(/\r?\n/, 1)[0] || commit?.commit?.message || commit?.message || 'Update');
  // Commit bodies are hard-wrapped, so one bullet per line splits sentences.
  // Paragraphs are the unit; normalizeSummary collapses the wrap inside each.
  const body = stripPublishedTrailers(
    String(commit?.commit?.message || commit?.message || '')
      .split(/\r?\n/)
      .slice(1)
      .join('\n'),
  )
    .split(/\n[ \t]*\n+/)
    .map((paragraph) => normalizeSummary(paragraph))
    .filter(Boolean);

  // Deliberately unescaped. This body is handed to buildDiscordReleasePayloads,
  // whose stripMarkdown does the escaping; doing it here too yields a visible
  // backslash before every underscore.
  return {
    summary: subject,
    details: body,
  };
}

export function buildBodyFromCommits(commits, compareUrl, buildUrl, trackingTag) {
  const groups = new Map([
    ['Added', []],
    ['Fixed', []],
    ['Changed', []],
  ]);

  for (const commit of commits) {
    const item = toDetailedItem(commit);
    const bucket = classifyCommit(item.summary);
    const list = groups.get(bucket);
    if (list) {
      list.push(item);
    }
  }

  const sections = [];
  const metadataLines = [];
  if (compareUrl) {
    metadataLines.push(`Compare: ${compareUrl}`);
  }
  if (buildUrl) {
    metadataLines.push(`Build run: ${buildUrl}`);
  }
  if (trackingTag) {
    metadataLines.push(`Tracking tag: ${trackingTag}`);
  }

  if (metadataLines.length) {
    sections.push(metadataLines.join('\n'));
  }

  const ordered = ['Added', 'Fixed', 'Changed'];
  for (const title of ordered) {
    const items = groups.get(title) || [];
    if (!items.length) {
      continue;
    }
    const lines = [`## ${title}`];
    for (const item of items) {
      lines.push(`- ${item.summary}`);
      for (const detail of item.details) {
        lines.push(`  - ${detail}`);
      }
    }
    sections.push(lines.join('\n'));
  }

  if (sections.length === 1) {
    sections.push('## Changed\n- Dev build updates published from main.');
  }

  return sections.join('\n\n');
}

async function fetchJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'xrdb/discord-dev-build',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    const error = new Error(`GitHub request failed with ${response.status} for ${url}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

async function fetchCommitsForRange({ repository, token, beforeSha, afterSha }) {
  if (!beforeSha || /^0+$/.test(beforeSha)) {
    const payload = await fetchJson(
      `https://api.github.com/repos/${repository}/commits?sha=${encodeURIComponent(afterSha)}&per_page=100`,
      token,
    );
    return Array.isArray(payload) ? payload : [];
  }

  const payload = await fetchJson(
    `https://api.github.com/repos/${repository}/compare/${encodeURIComponent(beforeSha)}...${encodeURIComponent(afterSha)}`,
    token,
  );
  return Array.isArray(payload?.commits) ? payload.commits : [];
}

async function postToDiscord(webhookUrl, payload) {
  const response = await fetch(resolveDiscordWebhookPostUrl(webhookUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`Discord webhook failed with ${response.status}${details ? `: ${details}` : ''}`);
  }
}

async function main() {
  const webhookUrl = requireEnv('WEBHOOK_URL');
  const repository = requireEnv('REPOSITORY');
  const deploymentVersion = requireEnv('DEPLOYMENT_VERSION');
  const beforeSha = String(process.env.BEFORE_SHA || '').trim();
  const afterSha = requireEnv('AFTER_SHA');
  const trackingTag = String(process.env.DEV_TRACK_TAG || '').trim();
  const buildUrl = String(process.env.BUILD_URL || '').trim();
  const discordRoleId = String(process.env.DISCORD_ROLE_ID || '').trim();
  const token = requireEnv('GITHUB_TOKEN');

  const commits = await fetchCommitsForRange({ repository, token, beforeSha, afterSha });
  const compareUrl = beforeSha && !/^0+$/.test(beforeSha)
    ? `https://github.com/${repository}/compare/${beforeSha}...${afterSha}`
    : `https://github.com/${repository}/commits/${afterSha}`;

  const release = {
    tag_name: deploymentVersion,
    name: `XRDB Dev Build ${deploymentVersion}`,
    body: buildBodyFromCommits(commits, compareUrl, buildUrl, trackingTag),
    html_url: buildUrl || compareUrl,
    published_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    draft: false,
    prerelease: true,
    id: 0,
  };

  const payloads = buildDiscordReleasePayloads({
    repository,
    release,
    previousReleaseTag: '',
    isTagFallback: true,
    discordRoleId,
  });

  for (const payload of payloads) {
    await postToDiscord(webhookUrl, payload);
  }

  console.log(`Sent Discord dev build notification for ${deploymentVersion} in ${payloads.length} message${payloads.length === 1 ? '' : 's'}`);
}

// Guarded so the module can be imported by a test without posting anything,
// matching post-discord-release.mjs beside it.
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
