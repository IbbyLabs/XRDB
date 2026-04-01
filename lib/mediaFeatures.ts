export type MediaFeatureBadgeKey =
  | 'certification'
  | 'netflix'
  | 'hbo'
  | 'primevideo'
  | 'disneyplus'
  | 'appletvplus'
  | 'hulu'
  | 'paramountplus'
  | 'peacock'
  | '4k'
  | 'bluray'
  | 'hdr'
  | 'dolbyvision'
  | 'dolbyatmos'
  | 'remux';

export type MediaFeatureFlags = {
  has4k: boolean;
  hasBluray: boolean;
  hasHdr: boolean;
  hasDolbyVision: boolean;
  hasDolbyAtmos: boolean;
  hasRemux: boolean;
};

export type MediaFeatureBadgeMeta = {
  key: MediaFeatureBadgeKey;
  label: string;
  accentColor: string;
};

const DEFAULT_CERTIFICATION_REGION_ORDER = [
  'US',
  'GB',
  'CA',
  'AU',
  'NZ',
  'DE',
  'FR',
  'IT',
  'ES',
  'PT',
  'BR',
  'JP',
  'KR',
] as const;

const MOVIE_RELEASE_TYPE_ORDER = [5, 4, 3, 2, 6, 1] as const;
const MEDIA_FEATURE_META_BY_KEY: Record<MediaFeatureBadgeKey, MediaFeatureBadgeMeta> = {
  certification: {
    key: 'certification',
    label: '',
    accentColor: '#f5f5f4',
  },
  netflix: {
    key: 'netflix',
    label: 'Netflix',
    accentColor: '#e50914',
  },
  hbo: {
    key: 'hbo',
    label: 'HBO',
    accentColor: '#ffffff',
  },
  primevideo: {
    key: 'primevideo',
    label: 'Prime Video',
    accentColor: '#22d3ee',
  },
  disneyplus: {
    key: 'disneyplus',
    label: 'Disney Plus',
    accentColor: '#60a5fa',
  },
  appletvplus: {
    key: 'appletvplus',
    label: 'Apple TV Plus',
    accentColor: '#e5e7eb',
  },
  hulu: {
    key: 'hulu',
    label: 'Hulu',
    accentColor: '#22c55e',
  },
  paramountplus: {
    key: 'paramountplus',
    label: 'Paramount Plus',
    accentColor: '#3b82f6',
  },
  peacock: {
    key: 'peacock',
    label: 'Peacock',
    accentColor: '#f59e0b',
  },
  '4k': {
    key: '4k',
    label: '4K',
    accentColor: '#f7c948',
  },
  bluray: {
    key: 'bluray',
    label: 'Bluray',
    accentColor: '#cbd5e1',
  },
  hdr: {
    key: 'hdr',
    label: 'HDR',
    accentColor: '#22d3ee',
  },
  dolbyvision: {
    key: 'dolbyvision',
    label: 'Dolby Vision',
    accentColor: '#e5e7eb',
  },
  dolbyatmos: {
    key: 'dolbyatmos',
    label: 'Dolby Atmos',
    accentColor: '#e5e7eb',
  },
  remux: {
    key: 'remux',
    label: 'Remux',
    accentColor: '#ef4444',
  },
};
export const MEDIA_FEATURE_BADGE_ORDER: MediaFeatureBadgeKey[] = [
  'certification',
  'netflix',
  'hbo',
  'primevideo',
  'disneyplus',
  'appletvplus',
  'hulu',
  'paramountplus',
  'peacock',
  '4k',
  'bluray',
  'hdr',
  'dolbyvision',
  'dolbyatmos',
  'remux',
];
const MEDIA_FEATURE_BADGE_KEY_SET = new Set<MediaFeatureBadgeKey>(MEDIA_FEATURE_BADGE_ORDER);

const normalizeRegionCode = (value: unknown) => {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^[A-Z]{2}$/.test(normalized) ? normalized : '';
};

const buildCertificationRegionOrder = (requestedLanguage?: string | null) => {
  const normalized = typeof requestedLanguage === 'string' ? requestedLanguage.trim() : '';
  const regionMatch = normalized.match(/[-_]([A-Za-z]{2})$/);
  const preferredRegion = normalizeRegionCode(regionMatch?.[1]);
  const result = preferredRegion ? [preferredRegion] : [];
  for (const region of DEFAULT_CERTIFICATION_REGION_ORDER) {
    if (!result.includes(region)) {
      result.push(region);
    }
  }
  return result;
};

const collapseUserFacingSpaces = (value: string) =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const normalizeUserFacingMediaBadgeLabel = (value?: string | null) => {
  const normalized = collapseUserFacingSpaces(String(value || ''));
  if (/^blu\s*ray$/i.test(normalized)) {
    return 'Bluray';
  }
  return normalized || null;
};

export const normalizeCertificationBadgeLabel = (value?: string | null) => {
  const normalized = normalizeUserFacingMediaBadgeLabel(value)?.toUpperCase() || '';
  if (!normalized) return null;
  if (
    normalized === 'NR' ||
    normalized === 'N A' ||
    normalized === 'N/A' ||
    normalized === 'NOT RATED' ||
    normalized === 'UNRATED' ||
    normalized === 'UNKNOWN'
  ) {
    return null;
  }
  return normalized.replace(/\s*\+\s*/g, '+');
};

export const createEmptyMediaFeatureFlags = (): MediaFeatureFlags => ({
  has4k: false,
  hasBluray: false,
  hasHdr: false,
  hasDolbyVision: false,
  hasDolbyAtmos: false,
  hasRemux: false,
});

export const parseMediaFeatureFlagsFromFilename = (filename: string): MediaFeatureFlags => {
  const normalized = filename.toUpperCase();
  const hasDolbyVision =
    /\bDOVI\b/.test(normalized) || /\bDV\b/.test(normalized) || /DOLBY\s*VISION/.test(normalized);
  const hasHdr =
    /\bHDR10\+\b/.test(normalized) ||
    /\bHDR10\b/.test(normalized) ||
    /\bHDR\b/.test(normalized) ||
    /\bHLG\b/.test(normalized) ||
    hasDolbyVision;
  const hasDolbyAtmos = /\bATMOS\b/.test(normalized) || /DOLBY\s*ATMOS/.test(normalized);
  const has4k =
    /\b2160P\b/.test(normalized) ||
    /\b2160\b/.test(normalized) ||
    /\b4K\b/.test(normalized) ||
    /\bUHD\b/.test(normalized) ||
    /\bULTRAHD\b/.test(normalized);
  const hasBluray =
    /\bBLU[\s._-]?RAY\b/.test(normalized) ||
    /\bBDRIP\b/.test(normalized) ||
    /\bBDREMUX\b/.test(normalized) ||
    /\bBDMV\b/.test(normalized) ||
    /\bBDISO\b/.test(normalized) ||
    /\bBD25\b/.test(normalized) ||
    /\bBD50\b/.test(normalized) ||
    /\bBRRIP\b/.test(normalized);
  const hasRemux = /\bREMUX\b/.test(normalized) || /\bBDREMUX\b/.test(normalized);
  return { has4k, hasBluray, hasHdr, hasDolbyVision, hasDolbyAtmos, hasRemux };
};

export const mergeMediaFeatureFlags = (
  left: MediaFeatureFlags,
  right: MediaFeatureFlags,
): MediaFeatureFlags => ({
  has4k: left.has4k || right.has4k,
  hasBluray: left.hasBluray || right.hasBluray,
  hasHdr: left.hasHdr || right.hasHdr,
  hasDolbyVision: left.hasDolbyVision || right.hasDolbyVision,
  hasDolbyAtmos: left.hasDolbyAtmos || right.hasDolbyAtmos,
  hasRemux: left.hasRemux || right.hasRemux,
});

export const collectMediaFeatureFlags = (filenames: string[]) => {
  let flags = createEmptyMediaFeatureFlags();
  for (const filename of filenames) {
    if (!filename) continue;
    flags = mergeMediaFeatureFlags(flags, parseMediaFeatureFlagsFromFilename(filename));
    if (
      flags.has4k &&
      flags.hasBluray &&
      flags.hasHdr &&
      flags.hasDolbyVision &&
      flags.hasDolbyAtmos &&
      flags.hasRemux
    ) {
      break;
    }
  }
  return flags;
};

export const buildMediaFeatureBadgesFromFlags = (flags: MediaFeatureFlags) => {
  const badges: MediaFeatureBadgeMeta[] = [];
  if (flags.has4k) badges.push(MEDIA_FEATURE_META_BY_KEY['4k']);
  const hasPhysicalDiscSource = flags.hasBluray || flags.hasRemux;
  if (hasPhysicalDiscSource) badges.push(MEDIA_FEATURE_META_BY_KEY.bluray);
  if (!flags.hasDolbyVision && flags.hasHdr) badges.push(MEDIA_FEATURE_META_BY_KEY.hdr);
  if (flags.hasDolbyVision) badges.push(MEDIA_FEATURE_META_BY_KEY.dolbyvision);
  if (flags.hasDolbyAtmos) badges.push(MEDIA_FEATURE_META_BY_KEY.dolbyatmos);
  if (flags.hasRemux && !flags.hasBluray) badges.push(MEDIA_FEATURE_META_BY_KEY.remux);
  return badges;
};

const normalizeNetworkName = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const resolveStreamingProviderBadgeKey = (
  normalizedProviderName: string,
): MediaFeatureBadgeKey | null => {
  if (!normalizedProviderName) return null;
  if (normalizedProviderName.includes('netflix')) return 'netflix';
  if (
    normalizedProviderName.includes('hbomax') ||
    normalizedProviderName === 'max' ||
    normalizedProviderName.startsWith('max') ||
    normalizedProviderName.includes('hbo')
  ) {
    return 'hbo';
  }
  if (
    normalizedProviderName.includes('primevideo') ||
    normalizedProviderName.includes('amazonprimevideo') ||
    normalizedProviderName.includes('primeamazon')
  ) {
    return 'primevideo';
  }
  if (normalizedProviderName.includes('disneyplus') || normalizedProviderName.includes('disney')) {
    return 'disneyplus';
  }
  if (
    normalizedProviderName.includes('appletvplus') ||
    normalizedProviderName.includes('appletv')
  ) {
    return 'appletvplus';
  }
  if (normalizedProviderName.includes('hulu')) return 'hulu';
  if (
    normalizedProviderName.includes('paramountplus') ||
    normalizedProviderName === 'paramount'
  ) {
    return 'paramountplus';
  }
  if (normalizedProviderName.includes('peacock')) return 'peacock';
  return null;
};

const buildOrderedProviderBadgesFromNames = (providerNames: unknown[]): MediaFeatureBadgeMeta[] => {
  const matchedKeys = new Set<MediaFeatureBadgeKey>();
  for (const providerName of providerNames) {
    const normalizedName = normalizeNetworkName(providerName);
    const key = resolveStreamingProviderBadgeKey(normalizedName);
    if (key) {
      matchedKeys.add(key);
    }
  }
  return MEDIA_FEATURE_BADGE_ORDER.flatMap((key) =>
    matchedKeys.has(key) ? [MEDIA_FEATURE_META_BY_KEY[key]] : [],
  );
};

export const buildNetworkBadgesFromTvNetworks = (networks: unknown): MediaFeatureBadgeMeta[] => {
  if (!Array.isArray(networks) || networks.length === 0) return [];
  return buildOrderedProviderBadgesFromNames(
    networks.map((network) =>
      network && typeof network === 'object' && 'name' in network
        ? (network as { name?: unknown }).name
        : '',
    ),
  );
};

const STREAM_PROVIDER_BUCKETS = ['flatrate', 'free', 'ads'] as const;

const hasWatchProviderEntries = (regionResult: unknown) =>
  Boolean(
    regionResult &&
      typeof regionResult === 'object' &&
      STREAM_PROVIDER_BUCKETS.some((bucket) =>
        Array.isArray((regionResult as Record<string, unknown>)[bucket]) &&
        ((regionResult as Record<string, unknown>)[bucket] as unknown[]).length > 0,
      ),
  );

export const buildNetworkBadgesFromWatchProviderResults = (
  watchProviderResults: unknown,
  requestedLanguage?: string | null,
): MediaFeatureBadgeMeta[] => {
  if (!watchProviderResults || typeof watchProviderResults !== 'object') return [];

  const results = watchProviderResults as Record<string, unknown>;
  const regionOrder = buildCertificationRegionOrder(requestedLanguage);
  const normalizedResultEntries = Object.entries(results).flatMap(([regionCode, regionResult]) => {
    const normalizedRegion = normalizeRegionCode(regionCode);
    return normalizedRegion ? [[normalizedRegion, regionResult] as const] : [];
  });

  let selectedRegionResult =
    regionOrder
      .map((regionCode) =>
        normalizedResultEntries.find(([candidateRegion]) => candidateRegion === regionCode)?.[1],
      )
      .find((regionResult) => hasWatchProviderEntries(regionResult)) || null;

  if (!selectedRegionResult) {
    selectedRegionResult =
      normalizedResultEntries.find(([, regionResult]) => hasWatchProviderEntries(regionResult))?.[1] ||
      null;
  }

  if (!selectedRegionResult || typeof selectedRegionResult !== 'object') return [];

  const providerNames = STREAM_PROVIDER_BUCKETS.flatMap((bucket) => {
    const providers = (selectedRegionResult as Record<string, unknown>)[bucket];
    if (!Array.isArray(providers)) return [];
    return providers.map((provider) =>
      provider && typeof provider === 'object' && 'provider_name' in provider
        ? (provider as { provider_name?: unknown }).provider_name
        : '',
    );
  });

  return buildOrderedProviderBadgesFromNames(providerNames);
};

const getMovieCertificationCandidates = (result: any) => {
  const entries = Array.isArray(result?.release_dates) ? result.release_dates : [];
  const rankedEntries = [...entries].sort((left, right) => {
    const leftIndex = MOVIE_RELEASE_TYPE_ORDER.indexOf(left?.type);
    const rightIndex = MOVIE_RELEASE_TYPE_ORDER.indexOf(right?.type);
    const leftScore = leftIndex === -1 ? MOVIE_RELEASE_TYPE_ORDER.length : leftIndex;
    const rightScore = rightIndex === -1 ? MOVIE_RELEASE_TYPE_ORDER.length : rightIndex;
    return leftScore - rightScore;
  });
  return rankedEntries
    .map((entry) => normalizeCertificationBadgeLabel(entry?.certification))
    .filter((entry): entry is string => Boolean(entry));
};

export const resolveMovieCertificationBadge = (
  releaseDatesPayload: any,
  requestedLanguage?: string | null,
) => {
  const results = Array.isArray(releaseDatesPayload?.results) ? releaseDatesPayload.results : [];
  const regionOrder = buildCertificationRegionOrder(requestedLanguage);
  for (const region of regionOrder) {
    const regionResult = results.find((entry: any) => normalizeRegionCode(entry?.iso_3166_1) === region);
    const certification = getMovieCertificationCandidates(regionResult)[0];
    if (certification) return certification;
  }
  for (const result of results) {
    const certification = getMovieCertificationCandidates(result)[0];
    if (certification) return certification;
  }
  return null;
};

export const hasMoviePhysicalMediaRelease = (
  releaseDatesPayload: any,
  nowMs = Date.now(),
) => {
  const results = Array.isArray(releaseDatesPayload?.results) ? releaseDatesPayload.results : [];

  for (const result of results) {
    const entries = Array.isArray(result?.release_dates) ? result.release_dates : [];
    for (const entry of entries) {
      if (Number(entry?.type) !== 5) continue;

      const releaseTimestamp = Date.parse(String(entry?.release_date || ''));
      if (!Number.isFinite(releaseTimestamp)) {
        return true;
      }
      if (releaseTimestamp <= nowMs) {
        return true;
      }
    }
  }

  return false;
};

export const resolveTvCertificationBadge = (
  contentRatingsPayload: any,
  requestedLanguage?: string | null,
) => {
  const results = Array.isArray(contentRatingsPayload?.results) ? contentRatingsPayload.results : [];
  const regionOrder = buildCertificationRegionOrder(requestedLanguage);
  for (const region of regionOrder) {
    const regionResult = results.find((entry: any) => normalizeRegionCode(entry?.iso_3166_1) === region);
    const certification = normalizeCertificationBadgeLabel(regionResult?.rating);
    if (certification) return certification;
  }
  for (const result of results) {
    const certification = normalizeCertificationBadgeLabel(result?.rating);
    if (certification) return certification;
  }
  return null;
};

export const isMediaFeatureBadgeKey = (value: string): value is MediaFeatureBadgeKey =>
  MEDIA_FEATURE_BADGE_KEY_SET.has(value as MediaFeatureBadgeKey);

export const buildCertificationBadgeMeta = (label: string): MediaFeatureBadgeMeta => ({
  ...MEDIA_FEATURE_META_BY_KEY.certification,
  label: normalizeCertificationBadgeLabel(label) || '',
});
