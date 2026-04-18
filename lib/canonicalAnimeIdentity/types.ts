export type CanonicalAnimeProvider =
  | 'imdb'
  | 'tmdb'
  | 'tvdb'
  | 'kitsu'
  | 'anilist'
  | 'mal'
  | 'anidb'
  | 'xrdbid'
  | 'unknown';

export const normalizeCanonicalAnimeProvider = (value?: string | null): CanonicalAnimeProvider => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'unknown';
  if (normalized === 'myanimelist') return 'mal';
  if (
    normalized === 'imdb' ||
    normalized === 'tmdb' ||
    normalized === 'tvdb' ||
    normalized === 'kitsu' ||
    normalized === 'anilist' ||
    normalized === 'mal' ||
    normalized === 'anidb' ||
    normalized === 'xrdbid'
  ) {
    return normalized;
  }
  return 'unknown';
};

export type CanonicalResolutionSource =
  | 'cache'
  | 'override'
  | 'raw'
  | 'reverse-mapping'
  | 'kitsu-mapping'
  | 'secondary-bridge'
  | 'fallback';

export type CanonicalMappedIds = Partial<Record<Exclude<CanonicalAnimeProvider, 'xrdbid' | 'unknown'>, string>>;

export type CanonicalSeriesProviderLink = {
  provider: CanonicalAnimeProvider;
  externalId: string;
  isPrimary: boolean;
  source: CanonicalResolutionSource;
  confidence: number | null;
};

export type CanonicalEpisodeProviderRef = {
  provider: CanonicalAnimeProvider;
  seriesExternalId: string;
  seasonNumber: string | null;
  episodeNumber: string | null;
  absoluteEpisodeNumber: string | null;
  role?: 'raw-source' | 'authority' | 'mapped';
  source: CanonicalResolutionSource;
  confidence: number | null;
};

export type RawEpisodeIdentityInput = {
  rawId: string;
  rawProvider: CanonicalAnimeProvider;
  rawExternalId: string | null;
  mediaType: 'movie' | 'tv' | null;
  season: string | null;
  episode: string | null;
  absoluteEpisode: string | null;
  episodeProvider: CanonicalAnimeProvider | null;
  episodeSourceId: string | null;
  episodeSourceSeason: string | null;
  episodeSourceEpisode: string | null;
  episodeAbsolute: string | null;
  tmdbEpOrder: 'tvdb' | 'tmdb';
};

export type CanonicalSeriesIdentity = {
  canonicalSeriesId: string;
  provider: CanonicalAnimeProvider;
  externalId: string;
  mediaType: 'movie' | 'tv' | null;
  mappedIds: CanonicalMappedIds;
  links: CanonicalSeriesProviderLink[];
  source: CanonicalResolutionSource;
  confidence: number | null;
  sourceUpdatedAt: number | null;
};

export type CanonicalEpisodeIdentity = {
  canonicalEpisodeId: string;
  canonicalSeriesId: string;
  season: string | null;
  episode: string | null;
  absoluteEpisode: string | null;
  mappedIds: CanonicalMappedIds;
  providerRefs: CanonicalEpisodeProviderRef[];
  source: CanonicalResolutionSource;
  confidence: number | null;
};

export type CanonicalMappingOverride = {
  lookupKey: string;
  scope: 'series' | 'episode';
  provider: CanonicalAnimeProvider | null;
  externalKey: string;
  payload: CanonicalSeriesIdentity | CanonicalEpisodeIdentity;
  reason: string | null;
  updatedAt: number;
};

export type CanonicalSeriesCacheRecord = {
  identity: CanonicalSeriesIdentity;
  updatedAt: number;
};

export type CanonicalEpisodeCacheRecord = {
  identity: CanonicalEpisodeIdentity;
  updatedAt: number;
};