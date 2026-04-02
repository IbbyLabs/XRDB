export const LATEST_GITHUB_RELEASE_TTL_SECONDS = 60;
const DEFAULT_GITHUB_RELEASE_TIMEOUT_MS = 4_000;
const DEFAULT_GITHUB_REPOSITORY_URL = 'https://github.com/IbbyLabs/XRDB';

export type GitHubRepository = {
  owner: string;
  name: string;
  htmlUrl: string;
  latestReleaseApiUrl: string;
  releasesApiUrl: string;
};

export type LatestGitHubRelease = {
  tagName: string;
  url: string;
  publishedAt: string | null;
  pendingTagName: string | null;
};

export type GitHubReleaseApiResponse = {
  id?: unknown;
  tag_name?: unknown;
  html_url?: unknown;
  published_at?: unknown;
  draft?: unknown;
  prerelease?: unknown;
};

type NextFetchInit = RequestInit & {
  next?: {
    revalidate?: number;
  };
};

function getRepositoryCandidates(): string[] {
  return [
    String(process.env.NEXT_PUBLIC_BRAND_GITHUB_URL || '').trim(),
    DEFAULT_GITHUB_REPOSITORY_URL,
  ].filter(Boolean);
}

export function normalizeReleaseTag(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

export function parseGitHubRepositoryUrl(value: string): GitHubRepository | null {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(trimmed.replace(/^git\+/, ''));
  } catch {
    return null;
  }

  if (!['github.com', 'www.github.com'].includes(url.hostname.toLowerCase())) {
    return null;
  }

  const [owner, name] = url.pathname
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
    .split('/');

  if (!owner || !name) {
    return null;
  }

  const htmlUrl = `https://github.com/${owner}/${name}`;

  return {
    owner,
    name,
    htmlUrl,
    latestReleaseApiUrl: `https://api.github.com/repos/${owner}/${name}/releases/latest`,
    releasesApiUrl: `https://api.github.com/repos/${owner}/${name}/releases?per_page=100`,
  };
}

function parseReleaseVersionParts(tagName: string): number[] | null {
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

export function compareReleaseTagVersions(leftTagName: string, rightTagName: string): number {
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

  return leftTagName.localeCompare(rightTagName, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function parsePublishedTimestamp(value: string | null): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function normalizePublishedAt(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function parseReleaseId(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }

  return Number.NEGATIVE_INFINITY;
}

function isPublishedReleaseEntry(entry: GitHubReleaseApiResponse): boolean {
  return (
    entry?.draft !== true &&
    entry?.prerelease !== true &&
    Boolean(normalizeReleaseTag(entry.tag_name))
  );
}

export function selectLatestPublishedReleaseEntry(
  payload: GitHubReleaseApiResponse[]
): GitHubReleaseApiResponse | null {
  const releases = payload.filter(isPublishedReleaseEntry);

  if (!releases.length) {
    return null;
  }

  releases.sort((left, right) => {
    const versionDifference = compareReleaseTagVersions(
      normalizeReleaseTag(left.tag_name) || '',
      normalizeReleaseTag(right.tag_name) || ''
    );
    if (versionDifference !== 0) {
      return versionDifference;
    }

    const publishedDifference =
      parsePublishedTimestamp(normalizePublishedAt(left.published_at)) -
      parsePublishedTimestamp(normalizePublishedAt(right.published_at));
    if (publishedDifference !== 0) {
      return publishedDifference;
    }

    return parseReleaseId(left.id) - parseReleaseId(right.id);
  });

  return releases.at(-1) ?? null;
}

export function selectPreviousPublishedReleaseTag(
  payload: GitHubReleaseApiResponse[],
  currentTagName: string
): string {
  const currentTag = normalizeReleaseTag(currentTagName);
  if (!currentTag) {
    return '';
  }

  const publishedTags = Array.from(
    new Set(
      payload
        .filter(isPublishedReleaseEntry)
        .map((entry) => normalizeReleaseTag(entry.tag_name))
        .filter((entry): entry is string => Boolean(entry))
    )
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

export function selectPendingReleaseTag(
  payload: GitHubReleaseApiResponse[],
  latestPublishedTagName: string | null
): string | null {
  if (!latestPublishedTagName) {
    return null;
  }

  const unpublished = payload.filter(
    (entry) =>
      !isPublishedReleaseEntry(entry) &&
      Boolean(normalizeReleaseTag(entry.tag_name))
  );

  if (!unpublished.length) {
    return null;
  }

  const ahead = unpublished
    .map((entry) => normalizeReleaseTag(entry.tag_name))
    .filter((tag): tag is string => Boolean(tag))
    .filter(
      (tag) => compareReleaseTagVersions(tag, latestPublishedTagName) > 0
    );

  if (!ahead.length) {
    return null;
  }

  ahead.sort(compareReleaseTagVersions);
  return ahead.at(-1) ?? null;
}

function selectLatestPublishedRelease(
  payload: GitHubReleaseApiResponse[],
  repository: GitHubRepository
): LatestGitHubRelease | null {
  const release = selectLatestPublishedReleaseEntry(payload);
  const tagName = normalizeReleaseTag(release?.tag_name);

  if (!release || !tagName) {
    return null;
  }

  return {
    tagName,
    url:
      typeof release.html_url === 'string' && release.html_url.trim()
        ? release.html_url.trim()
        : `${repository.htmlUrl}/releases/tag/${tagName}`,
    publishedAt: normalizePublishedAt(release.published_at),
    pendingTagName: selectPendingReleaseTag(payload, tagName),
  };
}

export function resolveGitHubRepository(): GitHubRepository | null {
  for (const candidate of getRepositoryCandidates()) {
    const repository = parseGitHubRepositoryUrl(candidate);
    if (repository) {
      return repository;
    }
  }

  return null;
}

function normalizeGitHubReleaseTimeoutMs(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return DEFAULT_GITHUB_RELEASE_TIMEOUT_MS;
}

export async function fetchLatestGitHubRelease({
  repository = resolveGitHubRepository(),
  fetchImpl = fetch,
  timeoutMs = process.env.XRDB_GITHUB_RELEASE_TIMEOUT_MS,
}: {
  repository?: GitHubRepository | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number | string;
} = {}): Promise<LatestGitHubRelease | null> {
  if (!repository) {
    return null;
  }

  let response: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), normalizeGitHubReleaseTimeoutMs(timeoutMs));

  try {
    response = await fetchImpl(repository.releasesApiUrl, {
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'xrdb/latest-release',
      },
      signal: controller.signal,
      next: {
        revalidate: LATEST_GITHUB_RELEASE_TTL_SECONDS,
      },
    } as NextFetchInit);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    return null;
  }

  let payload: GitHubReleaseApiResponse[];

  try {
    payload = (await response.json()) as GitHubReleaseApiResponse[];
  } catch {
    return null;
  }

  if (!Array.isArray(payload)) {
    return null;
  }

  return selectLatestPublishedRelease(payload, repository);
}
