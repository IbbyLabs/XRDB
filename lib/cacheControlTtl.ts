const toPositiveTtlMs = (secondsValue: string | null) => {
  if (!secondsValue) return null;
  const seconds = Number.parseInt(secondsValue, 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return seconds * 1000;
};

const getDirectiveTtlMs = (cacheControl: string, directive: 's-maxage' | 'max-age') => {
  for (const segment of cacheControl.split(',')) {
    const normalizedSegment = segment.trim().toLowerCase();
    if (!normalizedSegment.startsWith(`${directive}=`)) continue;
    return toPositiveTtlMs(normalizedSegment.slice(directive.length + 1));
  }
  return null;
};

export const getCacheTtlMsFromCacheControl = (value: string | null | undefined, fallbackMs: number) => {
  const normalized = String(value || '').trim();
  if (!normalized) return fallbackMs;

  return (
    getDirectiveTtlMs(normalized, 's-maxage') ??
    getDirectiveTtlMs(normalized, 'max-age') ??
    fallbackMs
  );
};

const getProviderTtlMs = (
  provider: string,
  ttlByProvider: Map<string, number>,
  tmdbTtlMs: number,
) => {
  if (provider === 'tmdb') return tmdbTtlMs;
  const ttlMs = ttlByProvider.get(provider);
  if (!Number.isFinite(ttlMs) || !ttlMs || ttlMs <= 0) return null;
  return ttlMs;
};

export const getFinalImageCacheTtlMs = (input: {
  renderedRatingProviders: string[];
  ttlByProvider: Map<string, number>;
  tmdbTtlMs: number;
  fallbackTtlMs?: number;
}) => {
  let minimumTtlMs: number | null = null;

  for (const provider of input.renderedRatingProviders) {
    const ttlMs = getProviderTtlMs(provider, input.ttlByProvider, input.tmdbTtlMs);
    if (!ttlMs) continue;
    minimumTtlMs = minimumTtlMs === null ? ttlMs : Math.min(minimumTtlMs, ttlMs);
  }

  return minimumTtlMs ?? input.fallbackTtlMs ?? input.tmdbTtlMs;
};

export const buildPublicImageCacheControl = (ttlMs: number, staleWhileRevalidateSeconds = 60) => {
  const maxAgeSeconds = Math.max(60, Math.floor(ttlMs / 1000));
  const staleSeconds = Math.max(0, Math.trunc(staleWhileRevalidateSeconds));
  return `public, s-maxage=${maxAgeSeconds}, stale-while-revalidate=${staleSeconds}`;
};
