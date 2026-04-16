export const DEFAULT_TORRENTIO_BASE_URL = 'https://torrentio.strem.fun';

export const resolveTorrentioBaseUrl = (
  value: string | undefined,
  fallback = DEFAULT_TORRENTIO_BASE_URL,
): string | null => {
  if (value === undefined) {
    return fallback;
  }
  const rawValue = value.trim();
  if (!rawValue) {
    return null;
  }
  const candidate = rawValue;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return candidate.replace(/\/+$/, '');
  }
  parsed.hash = '';
  parsed.search = '';
  if (parsed.pathname.endsWith('/manifest.json')) {
    parsed.pathname = parsed.pathname.slice(0, -'/manifest.json'.length);
  }
  const normalizedPath = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${normalizedPath}`;
};

export const buildTorrentioStreamUrl = (baseUrl: string, type: 'movie' | 'series', id: string) =>
  `${baseUrl}/stream/${type}/${encodeURIComponent(id)}.json`;
