#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

const DISCORD_EMBED_COLOR = 0x7c3aed;
const MAX_RELEASE_LOOKUP_ATTEMPTS = Number(process.env.RELEASE_LOOKUP_ATTEMPTS || 5);
const RELEASE_LOOKUP_DELAY_SECONDS = Number(process.env.RELEASE_LOOKUP_DELAY_SECONDS || 2);
const MAX_EMBED_FIELD_LENGTH = 1024;
const MAX_EMBED_DESCRIPTION_LENGTH = 4096;
const MAX_SUMMARY_INTRO_LENGTH = 320;
const MAX_SUMMARY_SECTION_COUNT = 3;
const AVATAR_URL = 'https://raw.githubusercontent.com/IbbyLabs/xrdb/main/public/favicon-96x96.png';
const DISCORD_ROLE_ID_RE = /^\d+$/;
const TRACKED_RELEASE_ITEM_RE = /^(FR|BUG)[-\s]+(\d+)\b/i;

function normalizeReleaseTag(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function parseReleaseVersionParts(tagName) {
  const normalized = normalizeReleaseTag(tagName);
  if (!normalized) {
    return null;
  }

  const coreVersion = normalized.replace(/^v/i, '').split(/[+-]/, 1)[0];
  if (!coreVersion) {
    return null;
  }

  const parts = coreVersion.split('.');
  if (!parts.length || parts.some((part) => !/^\d+$/.test(part))) {
    return null;
  }

  return parts.map((part) => Number(part));
}

function compareReleaseTagVersions(leftTagName, rightTagName) {
  const leftParts = parseReleaseVersionParts(leftTagName);
  const rightParts = parseReleaseVersionParts(rightTagName);

  if (leftParts && rightParts) {
    const maxLength = Math.max(leftParts.length, rightParts.length);
    for (let index = 0; index < maxLength; index += 1) {
      const leftPart = leftParts[index] ?? 0;
      const rightPart = rightParts[index] ?? 0;
      if (leftPart !== rightPart) {
        return leftPart - rightPart;
      }
    }
  } else if (leftParts || rightParts) {
    return leftParts ? 1 : -1;
  }

  return String(leftTagName || '').localeCompare(String(rightTagName || ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function parsePublishedTimestamp(value) {
  if (!value || typeof value !== 'string') {
    return Number.NEGATIVE_INFINITY;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function parseReleaseId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }

  return Number.NEGATIVE_INFINITY;
}

function isPublishedReleaseEntry(entry) {
  return entry?.draft !== true && entry?.prerelease !== true && Boolean(normalizeReleaseTag(entry?.tag_name));
}

function selectLatestPublishedReleaseEntry(payload) {
  const releases = Array.isArray(payload) ? payload.filter(isPublishedReleaseEntry) : [];

  if (!releases.length) {
    return null;
  }

  releases.sort((left, right) => {
    const versionDifference = compareReleaseTagVersions(
      normalizeReleaseTag(left?.tag_name) || '',
      normalizeReleaseTag(right?.tag_name) || '',
    );
    if (versionDifference !== 0) {
      return versionDifference;
    }

    const publishedDifference =
      parsePublishedTimestamp(normalizeReleaseTag(left?.published_at)) -
      parsePublishedTimestamp(normalizeReleaseTag(right?.published_at));
    if (publishedDifference !== 0) {
      return publishedDifference;
    }

    return parseReleaseId(left?.id) - parseReleaseId(right?.id);
  });

  return releases.at(-1) ?? null;
}

function selectPreviousPublishedReleaseTag(payload, currentTagName) {
  const currentTag = normalizeReleaseTag(currentTagName);
  if (!currentTag) {
    return '';
  }

  const publishedTags = Array.from(
    new Set(
      (Array.isArray(payload) ? payload : [])
        .filter(isPublishedReleaseEntry)
        .map((entry) => normalizeReleaseTag(entry?.tag_name))
        .filter(Boolean),
    ),
  );

  if (!publishedTags.length) {
    return '';
  }

  publishedTags.sort(compareReleaseTagVersions);

  const currentIndex = publishedTags.findIndex((tagName) => tagName === currentTag);
  if (currentIndex <= 0) {
    return '';
  }

  return publishedTags[currentIndex - 1] || '';
}

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function normalizeDiscordRoleId(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed || !DISCORD_ROLE_ID_RE.test(trimmed)) {
    return '';
  }
  return trimmed;
}

export function resolveDiscordWebhookPostUrl(webhookUrl) {
  const normalized = String(webhookUrl || '').trim();

  try {
    const url = new URL(normalized);
    url.searchParams.set('wait', 'true');
    return url.toString();
  } catch {
    return normalized;
  }
}

function stripMarkdown(value) {
  return String(value || '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function trimField(value, maxLength = MAX_EMBED_FIELD_LENGTH) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function appendEllipsis(value, maxLength) {
  const trimmed = String(value || '').trimEnd();
  if (!trimmed) {
    return maxLength > 0 ? '…' : '';
  }

  if (trimmed.length + 2 <= maxLength) {
    return `${trimmed}\n…`;
  }

  if (maxLength <= 1) {
    return '…';
  }

  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function fitLines(lines, maxLength) {
  const normalized = (Array.isArray(lines) ? lines : [])
    .map((line) => String(line || '').trim())
    .filter(Boolean);

  if (!normalized.length) {
    return {
      text: '',
      consumedLines: 0,
      truncated: false,
    };
  }

  let value = '';
  let consumedLines = 0;

  for (const line of normalized) {
    const candidate = value ? `${value}\n${line}` : line;
    if (candidate.length <= maxLength) {
      value = candidate;
      consumedLines += 1;
      continue;
    }

    if (!value) {
      return {
        text: trimField(line, maxLength),
        consumedLines: 0,
        truncated: line.length > maxLength || normalized.length > 1,
      };
    }

    return {
      text: appendEllipsis(value, maxLength),
      consumedLines,
      truncated: true,
    };
  }

  return {
    text: value,
    consumedLines,
    truncated: false,
  };
}

function splitLongLine(line, maxLength) {
  const normalized = String(line || '').trim();
  if (!normalized) {
    return [];
  }

  if (normalized.length <= maxLength) {
    return [normalized];
  }

  if (maxLength <= 1) {
    return ['…'];
  }

  const parts = [];
  let remaining = normalized;

  while (remaining.length > maxLength) {
    let splitIndex = remaining.lastIndexOf(' ', maxLength - 1);
    if (splitIndex <= 0) {
      splitIndex = maxLength - 1;
    }

    const head = remaining.slice(0, splitIndex).trimEnd();
    parts.push(`${head}…`);
    remaining = `…${remaining.slice(splitIndex).trimStart()}`;
  }

  if (remaining) {
    parts.push(remaining);
  }

  return parts;
}

function splitPlainTextIntoBlocks(text, maxLength) {
  return splitLongLine(String(text || '').replace(/\s+/g, ' ').trim(), maxLength);
}

function getReleaseItemSummary(item) {
  if (typeof item === 'string') {
    return String(item).trim();
  }

  return String(item?.summary || '').trim();
}

function getReleaseItemDetails(item) {
  if (!item || typeof item === 'string' || !Array.isArray(item.details)) {
    return [];
  }

  return item.details
    .map((detail) => String(detail || '').trim())
    .filter(Boolean);
}

function splitLinesIntoBlocks(lines, maxLength) {
  const normalizedLines = [];

  for (const line of Array.isArray(lines) ? lines : []) {
    const parts = splitLongLine(line, maxLength);
    if (parts.length) {
      normalizedLines.push(...parts);
    }
  }

  const blocks = [];
  let current = '';

  for (const line of normalizedLines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current) {
      blocks.push(current);
    }

    current = line;
  }

  if (current) {
    blocks.push(current);
  }

  return blocks;
}

function formatDetailedReleaseItemLines(item) {
  const summary = getReleaseItemSummary(item);
  if (!summary) {
    return [];
  }

  const lines = [`• ${summary}`];

  for (const detail of getReleaseItemDetails(item)) {
    if (/^[•*-]\s+/.test(detail)) {
      lines.push(`  - ${detail.replace(/^[•*-]\s+/, '')}`);
      continue;
    }

    lines.push(`  ${detail}`);
  }

  return lines;
}

function splitDetailedSectionIntoBlocks(title, items, maxLength) {
  const heading = `**${title}**`;
  const blocks = [];
  const maxBodyLength = Math.max(1, maxLength - heading.length - 1);
  let current = heading;

  for (const item of items) {
    const itemBlocks = splitLinesIntoBlocks(formatDetailedReleaseItemLines(item), maxBodyLength);

    for (const itemBlock of itemBlocks) {
      const candidate = current === heading ? `${current}\n${itemBlock}` : `${current}\n\n${itemBlock}`;
      if (candidate.length <= maxLength) {
        current = candidate;
        continue;
      }

      if (current !== heading) {
        blocks.push(current);
      }

      current = `${heading}\n${itemBlock}`;
    }
  }

  if (current !== heading) {
    blocks.push(current);
  }

  return blocks;
}

function normalizeSectionTitle(value) {
  const normalized = stripMarkdown(value).replace(/[:]+$/g, '');
  if (!normalized) {
    return '';
  }

  const aliases = new Map([
    ['bug fixes', 'Fixed'],
    ['fixes', 'Fixed'],
    ['added', 'Added'],
    ['new', 'Added'],
    ['changed', 'Changed'],
    ['changes', 'Changed'],
    ['revert', 'Reverted'],
    ['reverts', 'Reverted'],
    ['reverted', 'Reverted'],
    ['other changes', 'Other Changes'],
    ['improved', 'Improved'],
    ['improvements', 'Improved'],
    ['security', 'Security'],
  ]);

  return aliases.get(normalized.toLowerCase()) || normalized;
}

function getSectionPriority(title) {
  const normalized = String(title || '').trim().toLowerCase();

  if (normalized === 'added') {
    return 0;
  }

  if (normalized === 'fixed') {
    return 1;
  }

  return 2;
}

function extractTrackedReleaseItem(value) {
  const match = getReleaseItemSummary(value).match(TRACKED_RELEASE_ITEM_RE);
  if (!match) {
    return {
      kind: '',
      id: Number.POSITIVE_INFINITY,
    };
  }

  return {
    kind: String(match[1] || '').toUpperCase(),
    id: Number(match[2]),
  };
}

function getSectionItemPriority(sectionTitle, item) {
  const normalizedTitle = String(sectionTitle || '').trim().toLowerCase();
  const trackedItem = extractTrackedReleaseItem(item);

  if (normalizedTitle === 'added') {
    return trackedItem.kind === 'FR' ? 0 : 1;
  }

  if (normalizedTitle === 'fixed') {
    if (trackedItem.kind === 'BUG') {
      return 0;
    }

    if (trackedItem.kind === 'FR') {
      return 1;
    }

    return 2;
  }

  return 0;
}

function orderReleaseSections(sections) {
  return (Array.isArray(sections) ? sections : [])
    .map((section, index) => ({
      section,
      index,
    }))
    .sort((left, right) => {
      const priorityDifference =
        getSectionPriority(left.section?.title) - getSectionPriority(right.section?.title);
      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      return left.index - right.index;
    })
    .map(({ section }) => section);
}

function orderSectionItems(sectionTitle, items) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({
      item,
      index,
      tracked: extractTrackedReleaseItem(item),
    }))
    .sort((left, right) => {
      const priorityDifference =
        getSectionItemPriority(sectionTitle, left.item) - getSectionItemPriority(sectionTitle, right.item);
      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      if (
        Number.isFinite(left.tracked.id) &&
        Number.isFinite(right.tracked.id) &&
        left.tracked.kind === right.tracked.kind &&
        left.tracked.id !== right.tracked.id
      ) {
        return left.tracked.id - right.tracked.id;
      }

      return left.index - right.index;
    })
    .map(({ item }) => item);
}

function parseReleaseBodySections(body) {
  const sections = [];
  const intro = [];
  let currentSection = null;
  let currentItem = null;

  const ensureSection = (title) => {
    const normalizedTitle = normalizeSectionTitle(title);
    if (!normalizedTitle) {
      return null;
    }

    const existing = sections.find((section) => section.title === normalizedTitle);
    if (existing) {
      return existing;
    }

    const next = { title: normalizedTitle, items: [] };
    sections.push(next);
    return next;
  };

  const pushSectionItem = (summary) => {
    const normalizedSummary = String(summary || '').trim();
    if (!normalizedSummary || !currentSection) {
      currentItem = null;
      return;
    }

    const item = {
      summary: normalizedSummary,
      details: [],
    };

    currentSection.items.push(item);
    currentItem = item;
  };

  for (const rawLine of String(body || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line.startsWith('[!') || /^>/.test(line) || /^changelog:/i.test(line)) {
      continue;
    }

    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      currentSection = ensureSection(headingMatch[1]);
      currentItem = null;
      continue;
    }

    const indentLength = rawLine.match(/^\s*/)?.[0].length || 0;
    const topLevelBulletMatch =
      indentLength === 0
        ? rawLine.match(/^[-*]\s+(.+)$/) || rawLine.match(/^\d+\.\s+(.+)$/)
        : null;

    if (topLevelBulletMatch) {
      const item = stripMarkdown(topLevelBulletMatch[1]);
      if (!item) {
        continue;
      }
      if (currentSection) {
        pushSectionItem(item);
      } else {
        intro.push(item);
      }
      continue;
    }

    const plainText = stripMarkdown(line);
    if (!plainText) {
      continue;
    }

    if (currentSection) {
      if (indentLength === 0) {
        pushSectionItem(plainText);
      } else if (currentItem) {
        currentItem.details.push(plainText);
      }
      continue;
    }

    intro.push(plainText);
  }

  return {
    intro: intro.join(' ').trim(),
    sections: orderReleaseSections(
      sections
        .filter((section) => section.items.length > 0)
        .map((section) => ({
          ...section,
          items: orderSectionItems(section.title, section.items),
        })),
    ),
  };
}

function buildSectionFields(body) {
  const { intro, sections } = parseReleaseBodySections(body);
  const fields = [];

  if (intro) {
    fields.push({
      name: 'Summary',
      value: trimField(intro, MAX_SUMMARY_INTRO_LENGTH),
      inline: false,
    });
  }

  for (const section of sections.slice(0, MAX_SUMMARY_SECTION_COUNT)) {
    const preview = fitLines(
      section.items.map((item) => `• ${getReleaseItemSummary(item)}`),
      MAX_EMBED_FIELD_LENGTH,
    );
    const value = preview.text;
    if (value) {
      fields.push({
        name: section.title,
        value,
        inline: false,
      });
    }
  }

  if (!fields.length) {
    fields.push({
      name: 'Summary',
      value: 'New XRDB release published.',
      inline: false,
    });
  }

  return fields;
}

function buildContinuationDescriptions(body) {
  const { intro, sections } = parseReleaseBodySections(body);
  const descriptions = [];

  if (intro.length > MAX_SUMMARY_INTRO_LENGTH) {
    descriptions.push(...splitPlainTextIntoBlocks(intro, MAX_EMBED_DESCRIPTION_LENGTH));
  }

  sections.forEach((section, index) => {
    const preview = fitLines(
      section.items.map((item) => `• ${getReleaseItemSummary(item)}`),
      MAX_EMBED_FIELD_LENGTH,
    );

    const hasDetails = section.items.some((item) => getReleaseItemDetails(item).length > 0);
    if (index < MAX_SUMMARY_SECTION_COUNT && !preview.truncated && !hasDetails) {
      return;
    }

    descriptions.push(...splitDetailedSectionIntoBlocks(section.title, section.items, MAX_EMBED_DESCRIPTION_LENGTH));
  });

  return descriptions;
}

function resolveCompareUrl(repository, currentTag, previousTag) {
  if (!previousTag) {
    return '';
  }

  return `https://github.com/${repository}/compare/${previousTag}...${currentTag}`;
}

function resolvePackageUrl(repository) {
  const [, repoName = 'xrdb'] = repository.split('/');
  return `https://github.com/${repository}/pkgs/container/${repoName}`;
}

function getVersionAnchor(version) {
  return String(version || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractChangelogSection(changelog, tagName) {
  const normalizedTag = normalizeReleaseTag(tagName);
  if (!normalizedTag) {
    return '';
  }

  const headingRe = new RegExp(`^## \\[${escapeRegExp(normalizedTag)}\\] - .*$`, 'm');
  const headingMatch = String(changelog || '').match(headingRe);
  if (!headingMatch || headingMatch.index == null) {
    return '';
  }

  const headingStart = headingMatch.index;
  const bodyStart = headingStart + headingMatch[0].length;
  const remaining = String(changelog || '').slice(bodyStart);
  const nextSectionMatch = remaining.match(/\n<a id="[^"]+"><\/a>\n\n## \[|\n## \[/);
  const section = (nextSectionMatch && nextSectionMatch.index != null
    ? remaining.slice(0, nextSectionMatch.index)
    : remaining).trim();

  return section;
}

function buildLinksField({ releaseUrl, compareUrl, repositoryUrl, packageUrl }) {
  const lines = [];
  if (releaseUrl) {
    lines.push(`[Release notes](${releaseUrl})`);
  }
  if (compareUrl) {
    lines.push(`[Full compare](${compareUrl})`);
  }
  if (packageUrl) {
    lines.push(`[Container package](${packageUrl})`);
  }
  if (repositoryUrl) {
    lines.push(`[Repository](${repositoryUrl})`);
  }

  return trimField(lines.join('\n'));
}

export function buildDiscordReleasePayload({
  repository,
  release,
  previousReleaseTag = '',
  isTagFallback = false,
  discordRoleId = '',
}) {
  const repositoryUrl = `https://github.com/${repository}`;
  const compareUrl = resolveCompareUrl(repository, release.tag_name, previousReleaseTag);
  const packageUrl = resolvePackageUrl(repository);
  const publishedAt = String(release.published_at || release.created_at || '').trim();
  const publishedTimestamp = Number.isFinite(Date.parse(publishedAt))
    ? Math.floor(Date.parse(publishedAt) / 1000)
    : null;
  const normalizedRoleId = normalizeDiscordRoleId(discordRoleId);
  const mentionContent = normalizedRoleId ? `<@&${normalizedRoleId}>` : '';

  const fields = [
    {
      name: 'Tag',
      value: `\`${release.tag_name}\``,
      inline: true,
    },
    {
      name: 'Published',
      value: publishedTimestamp
        ? `<t:${publishedTimestamp}:F>\n<t:${publishedTimestamp}:R>`
        : 'Unknown',
      inline: true,
    },
    {
      name: 'Links',
      value: buildLinksField({
        releaseUrl: release.html_url,
        compareUrl,
        repositoryUrl,
        packageUrl,
      }),
      inline: true,
    },
    ...buildSectionFields(release.body || ''),
  ].filter((field) => field.value);

  return {
    ...(mentionContent ? { content: mentionContent } : {}),
    username: 'XRDB Releases',
    avatar_url: AVATAR_URL,
    allowed_mentions: normalizedRoleId
      ? { roles: [normalizedRoleId] }
      : { parse: [] },
    embeds: [
      {
        author: {
          name: 'XRDB, eXtended Ratings DataBase',
          url: repositoryUrl,
          icon_url: AVATAR_URL,
        },
        title: release.name || release.tag_name || 'XRDB Release',
        url: release.html_url || repositoryUrl,
        description: isTagFallback
          ? `New XRDB tag published for \`${release.tag_name}\`.`
          : `New XRDB release published for \`${release.tag_name}\`.`,
        color: DISCORD_EMBED_COLOR,
        thumbnail: {
          url: AVATAR_URL,
        },
        fields,
        footer: {
          text: `${repository} • ${isTagFallback ? 'tag' : 'release'}`,
          icon_url: AVATAR_URL,
        },
        ...(publishedAt ? { timestamp: publishedAt } : {}),
      },
    ],
  };
}

function buildDiscordContinuationPayloads({ repository, release, descriptions }) {
  if (!Array.isArray(descriptions) || !descriptions.length) {
    return [];
  }

  const repositoryUrl = `https://github.com/${repository}`;
  const publishedAt = String(release.published_at || release.created_at || '').trim();
  const total = descriptions.length;
  const releaseName = String(release.name || release.tag_name || 'XRDB release').trim();

  return descriptions.map((description, index) => ({
    username: 'XRDB Releases',
    avatar_url: AVATAR_URL,
    allowed_mentions: { parse: [] },
    embeds: [
      {
        author: {
          name: 'XRDB, eXtended Ratings DataBase',
          url: repositoryUrl,
          icon_url: AVATAR_URL,
        },
        title: total > 1
          ? `${releaseName} release notes continued ${index + 1}/${total}`
          : `${releaseName} release notes continued`,
        url: release.html_url || repositoryUrl,
        description,
        color: DISCORD_EMBED_COLOR,
        footer: {
          text: total > 1
            ? `${repository} • release notes ${index + 1}/${total}`
            : `${repository} • release notes`,
          icon_url: AVATAR_URL,
        },
        ...(publishedAt ? { timestamp: publishedAt } : {}),
      },
    ],
  }));
}

export function buildDiscordReleasePayloads({
  repository,
  release,
  previousReleaseTag = '',
  isTagFallback = false,
  discordRoleId = '',
}) {
  const summaryPayload = buildDiscordReleasePayload({
    repository,
    release,
    previousReleaseTag,
    isTagFallback,
    discordRoleId,
  });
  const descriptions = buildContinuationDescriptions(release.body || '');

  if (descriptions.length) {
    const firstEmbed = summaryPayload.embeds?.[0];
    if (firstEmbed) {
      firstEmbed.description = descriptions[0];
      firstEmbed.fields = (Array.isArray(firstEmbed.fields) ? firstEmbed.fields : []).filter((field) =>
        ['Tag', 'Published', 'Links', 'Summary'].includes(field?.name),
      );
    }
  }

  return [
    summaryPayload,
    ...buildDiscordContinuationPayloads({
      repository,
      release,
      descriptions: descriptions.slice(1),
    }),
  ];
}

async function fetchJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'xrdb/discord-release',
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

async function resolveTagTimestamp({ apiUrl, token, tagName }) {
  try {
    const ref = await fetchJson(`${apiUrl}/git/ref/tags/${encodeURIComponent(tagName)}`, token);
    const objectType = String(ref?.object?.type || '').trim();
    const objectSha = String(ref?.object?.sha || '').trim();

    if (!objectType || !objectSha) {
      return '';
    }

    if (objectType === 'tag') {
      const tagObject = await fetchJson(`${apiUrl}/git/tags/${objectSha}`, token);
      return String(tagObject?.tagger?.date || '').trim();
    }

    if (objectType === 'commit') {
      const commitObject = await fetchJson(`${apiUrl}/commits/${objectSha}`, token);
      return String(commitObject?.commit?.committer?.date || commitObject?.commit?.author?.date || '').trim();
    }

    return '';
  } catch {
    return '';
  }
}

async function fetchChangelogForTag({ apiUrl, token, tagName }) {
  try {
    const payload = await fetchJson(
      `${apiUrl}/contents/CHANGELOG.md?ref=${encodeURIComponent(tagName)}`,
      token,
    );
    const encoded = String(payload?.content || '').replace(/\n/g, '');
    if (!encoded) {
      return '';
    }
    return Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

async function buildTagFallbackRelease({ apiUrl, token, repository, tagName }) {
  const normalizedTag = normalizeReleaseTag(tagName);
  if (!normalizedTag) {
    return null;
  }

  const publishedAt = await resolveTagTimestamp({ apiUrl, token, tagName: normalizedTag });
  const changelog = await fetchChangelogForTag({ apiUrl, token, tagName: normalizedTag });
  const changelogSection = extractChangelogSection(changelog, normalizedTag);
  const changelogUrl = `https://github.com/${repository}/blob/${normalizedTag}/CHANGELOG.md#${getVersionAnchor(normalizedTag)}`;
  const fallbackBody = changelogSection
    ? `> Changelog: ${changelogUrl}\n\n${changelogSection}`
    : `> Changelog: ${changelogUrl}`;

  return {
    tag_name: normalizedTag,
    name: normalizedTag,
    body: fallbackBody,
    html_url: `https://github.com/${repository}/releases/tag/${normalizedTag}`,
    published_at: publishedAt,
    created_at: publishedAt,
    draft: false,
    prerelease: false,
    id: 0,
  };
}

async function lookupRelease({ apiUrl, releaseTag, token }) {
  const endpoint = releaseTag
    ? `${apiUrl}/releases/tags/${encodeURIComponent(releaseTag)}`
    : `${apiUrl}/releases?per_page=100`;

  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RELEASE_LOOKUP_ATTEMPTS; attempt += 1) {
    try {
      const payload = await fetchJson(endpoint, token);
      if (releaseTag) {
        return { release: payload, isTagFallback: false };
      }

      const release = Array.isArray(payload) ? selectLatestPublishedReleaseEntry(payload) : null;
      if (release) {
        return { release, isTagFallback: false };
      }

      throw new Error('Unable to resolve the highest published release tag from GitHub');
    } catch (error) {
      lastError = error;
      if (attempt === MAX_RELEASE_LOOKUP_ATTEMPTS) {
        break;
      }
      console.error(
        `Release lookup attempt ${attempt}/${MAX_RELEASE_LOOKUP_ATTEMPTS} failed. Retrying in ${RELEASE_LOOKUP_DELAY_SECONDS}s.`
      );
      await new Promise((resolve) => setTimeout(resolve, RELEASE_LOOKUP_DELAY_SECONDS * 1000));
    }
  }

  if (releaseTag) {
    const statusCode = Number(lastError?.status || 0);
    if (statusCode === 404) {
      return { release: null, isTagFallback: true };
    }
  }

  throw lastError || new Error(`Unable to fetch release details from ${endpoint}`);
}

async function resolvePreviousPublishedReleaseTag({ apiUrl, token, currentTag }) {
  try {
    const releases = await fetchJson(`${apiUrl}/releases?per_page=100`, token);
    if (!Array.isArray(releases)) {
      return '';
    }

    return selectPreviousPublishedReleaseTag(releases, currentTag);
  } catch {
    return '';
  }
}

async function resolvePreviousTagFromRepositoryTags({ apiUrl, token, currentTag }) {
  try {
    const tags = await fetchJson(`${apiUrl}/tags?per_page=100`, token);
    if (!Array.isArray(tags)) {
      return '';
    }

    const normalizedCurrentTag = normalizeReleaseTag(currentTag);
    const tagNames = Array.from(
      new Set(
        tags
          .map((entry) => normalizeReleaseTag(entry?.name))
          .filter((name) => Boolean(name) && /^v/i.test(String(name))),
      ),
    );

    if (!normalizedCurrentTag || !tagNames.length) {
      return '';
    }

    tagNames.sort(compareReleaseTagVersions);
    const currentIndex = tagNames.findIndex((tagName) => tagName === normalizedCurrentTag);
    if (currentIndex <= 0) {
      return '';
    }
    return tagNames[currentIndex - 1] || '';
  } catch {
    return '';
  }
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

export async function main() {
  const token = requireEnv('GITHUB_TOKEN');
  const webhookUrl = requireEnv('WEBHOOK_URL');
  const repository = requireEnv('REPOSITORY');
  const releaseTag = String(process.env.RELEASE_TAG || '').trim();
  const discordRoleId = normalizeDiscordRoleId(process.env.DISCORD_ROLE_ID);
  const apiUrl = `https://api.github.com/repos/${repository}`;

  const lookup = await lookupRelease({ apiUrl, releaseTag, token });
  let release = lookup?.release || null;
  let isTagFallback = lookup?.isTagFallback === true;

  if (!release && releaseTag) {
    release = await buildTagFallbackRelease({
      apiUrl,
      token,
      repository,
      tagName: releaseTag,
    });
  }

  if (!release) {
    throw new Error('Unable to resolve release or tag details from GitHub');
  }

  const currentTag = String(release.tag_name || '').trim();
  if (!currentTag) {
    throw new Error('Unable to resolve a release tag from GitHub');
  }

  const previousReleaseTag = isTagFallback
    ? await resolvePreviousTagFromRepositoryTags({ apiUrl, token, currentTag })
    : await resolvePreviousPublishedReleaseTag({ apiUrl, token, currentTag });

  const payloads = buildDiscordReleasePayloads({
    repository,
    release,
    previousReleaseTag,
    isTagFallback,
    discordRoleId,
  });

  for (const payload of payloads) {
    await postToDiscord(webhookUrl, payload);
  }

  console.log(`Sent Discord release notification for ${currentTag} in ${payloads.length} message${payloads.length === 1 ? '' : 's'}`);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
