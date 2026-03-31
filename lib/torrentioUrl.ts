export const DEFAULT_TORRENTIO_BASE_URL = 'https://torrentio.strem.fun';

export const resolveTorrentioBaseUrl = (
  value: string | undefined,
  fallback = DEFAULT_TORRENTIO_BASE_URL,
) => {
  const rawValue = (value || '').trim();
  const candidate = rawValue || fallback;
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
