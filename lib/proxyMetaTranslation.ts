import {
  DEFAULT_METADATA_TRANSLATION_MODE,
  normalizeMetadataTranslationMode,
  type MetadataTranslationMode,
} from './metadataTranslation.ts';
import {
  ANIME_MAPPING_BASE_URL,
  KITSU_API_BASE_URL,
  TMDB_API_BASE_URL,
} from './serviceBaseUrls.ts';

export type TmdbMediaType = 'movie' | 'tv';

export type TmdbTranslationTarget = {
  id: number;
  type: TmdbMediaType;
  details: Record<string, unknown>;
};

export type TranslationFieldSource = 'source' | 'tmdb' | 'anilist' | 'kitsu' | 'none';
export type TextFieldStatus = 'missing' | 'blank' | 'placeholder' | 'present';
export type TextFieldReason =
  | 'preserved-source'
  | 'preferred-requested-language'
  | 'preferred-tmdb'
  | 'filled-missing'
  | 'filled-blank'
  | 'filled-placeholder'
  | 'fallback-anime'
  | 'unavailable';

export type TextFieldDebug = {
  source: TranslationFieldSource;
  reason: TextFieldReason;
  existingStatus: TextFieldStatus;
  outputKey: string;
  exactRequestedLanguage: boolean | null;
  changed: boolean;
};

export type AppliedTextTranslationDebug = {
  title: TextFieldDebug;
  overview: TextFieldDebug;
};

export type AnimeTextFallback = {
  title: {
    value: string | null;
    source: 'anilist' | 'kitsu' | null;
    exactRequestedLanguage: boolean | null;
  };
  overview: {
    value: string | null;
    source: 'anilist' | 'kitsu' | null;
    exactRequestedLanguage: boolean | null;
  };
};

export type ApplyTranslatedTextFieldsOptions = {
  mode?: MetadataTranslationMode | null;
  tmdbTitle?: string | null;
  tmdbOverview?: string | null;
  tmdbTitleExactRequestedLanguage?: boolean | null;
  tmdbOverviewExactRequestedLanguage?: boolean | null;
  animeTitle?: string | null;
  animeOverview?: string | null;
  animeTitleSource?: 'anilist' | 'kitsu' | null;
  animeOverviewSource?: 'anilist' | 'kitsu' | null;
  animeTitleExactRequestedLanguage?: boolean | null;
  animeOverviewExactRequestedLanguage?: boolean | null;
};

const TITLE_FIELD_KEYS = ['name', 'title'] as const;
const OVERVIEW_FIELD_KEYS = ['description', 'overview', 'plot', 'synopsis'] as const;

type AnimeMappingProvider = 'mal' | 'anilist' | 'kitsu' | 'anidb';
type AnimeMappingLookup = {
  provider: AnimeMappingProvider;
  externalId: string;
  season: string | null;
};
type JsonFetcher = (url: string) => Promise<unknown>;
type AniListMediaFetcher = (id: string) => Promise<unknown>;
type ExistingFieldState = {
  key: string;
  status: TextFieldStatus;
  value: string | null;
  hasNonEmptyText: boolean;
  hasMeaningfulText: boolean;
};
type FieldCandidate = {
  value: string | null;
  source: TranslationFieldSource;
  exactRequestedLanguage: boolean | null;
};
type RequestedLanguage = {
  language: string | null;
  region: string | null;
};

const IMDB_RE = /^tt\d+$/i;
const ANIME_MAPPING_PROVIDER_SET = new Set<AnimeMappingProvider>(['mal', 'anilist', 'kitsu', 'anidb']);

const PLACEHOLDER_TEXT_SET = new Set([
  '-',
  '--',
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
  'unknown',
  'tbd',
]);

const toNonEmptyString = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
};

const normalizePositiveInteger = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const asInt = Math.trunc(value);
    return asInt > 0 ? asInt : null;
  }

  const normalized = toNonEmptyString(value);
  if (!normalized) return null;

  const match = normalized.match(/\d+/);
  if (!match) return null;

  const asInt = Number(match[0]);
  return Number.isFinite(asInt) && asInt > 0 ? asInt : null;
};

const hasNonEmptyText = (value: unknown) => toNonEmptyString(value) !== null;

export const hasMeaningfulText = (value: unknown) => {
  const normalized = toNonEmptyString(value);
  if (!normalized) return false;
  return !PLACEHOLDER_TEXT_SET.has(normalized.toLowerCase());
};

export const normalizeStremioType = (value: unknown): TmdbMediaType | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'movie' || normalized === 'film') return 'movie';
  if (normalized === 'series' || normalized === 'tv' || normalized === 'show') return 'tv';
  return null;
};

const normalizeLanguage = (value: string | null | undefined): RequestedLanguage => {
  const normalized = toNonEmptyString(value)?.replace(/_/g, '-') || null;
  if (!normalized) {
    return { language: null, region: null };
  }

  const [rawLanguage = '', rawRegion = ''] = normalized.split('-', 2);
  const language = rawLanguage.trim().toLowerCase() || null;
  const region = rawRegion.trim().toUpperCase() || null;
  return { language, region };
};

const buildPreferredTypeOrder = (preferredType: TmdbMediaType | null): TmdbMediaType[] => {
  if (preferredType === 'movie') return ['movie', 'tv'];
  if (preferredType === 'tv') return ['tv', 'movie'];
  return ['movie', 'tv'];
};

const extractAnimeSubtypeFromMapping = (payload: any) => {
  const candidates = [
    payload?.requested?.subtype,
    payload?.subtype,
    payload?.kitsu?.subtype,
    payload?.mappings?.subtype,
    payload?.data?.requested?.subtype,
    payload?.data?.subtype,
    payload?.data?.kitsu?.subtype,
    payload?.data?.mappings?.subtype,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const normalized = candidate.trim().toLowerCase();
    if (normalized) return normalized;
  }

  return null;
};

const getAnimeMappingTypeOrder = (metaType: unknown, payload: any): TmdbMediaType[] => {
  const stremioType = normalizeStremioType(metaType);
  if (stremioType) return buildPreferredTypeOrder(stremioType);

  return extractAnimeSubtypeFromMapping(payload) === 'movie' ? ['movie', 'tv'] : ['tv', 'movie'];
};

const extractTmdbIdFromAnimeMapping = (payload: any) => {
  const candidates = [payload?.mappings?.ids?.tmdb, payload?.data?.mappings?.ids?.tmdb];

  for (const candidate of candidates) {
    const tmdbId = normalizePositiveInteger(candidate);
    if (tmdbId) return tmdbId;
  }

  return null;
};

const parseAnimeMappingLookup = (xrdbId: string): AnimeMappingLookup | null => {
  const parts = xrdbId.split(':');
  const rawPrefix = (parts[0] || '').trim().toLowerCase();
  const prefix = rawPrefix === 'myanimelist' ? 'mal' : rawPrefix;
  if (!ANIME_MAPPING_PROVIDER_SET.has(prefix as AnimeMappingProvider)) {
    return null;
  }

  const externalId = toNonEmptyString(parts[1]);
  if (!externalId) return null;

  return {
    provider: prefix as AnimeMappingProvider,
    externalId,
    season: prefix === 'kitsu' ? null : toNonEmptyString(parts[2]),
  };
};

export const isAnimeXrdbId = (xrdbId: string) => parseAnimeMappingLookup(xrdbId) !== null;

const buildAnimeMappingUrl = (lookup: AnimeMappingLookup) => {
  const url = new URL(`${ANIME_MAPPING_BASE_URL}/${lookup.provider}/${encodeURIComponent(lookup.externalId)}`);
  if (lookup.season) {
    url.searchParams.set('s', lookup.season);
  }
  return url.toString();
};

const buildTmdbDetailsUrl = (
  tmdbId: number,
  type: TmdbMediaType,
  tmdbKey: string,
  lang: string | null,
) => {
  const url = new URL(`${TMDB_API_BASE_URL}/${type}/${tmdbId}`);
  url.searchParams.set('api_key', tmdbKey);
  if (lang) {
    url.searchParams.set('language', lang);
  }
  return url.toString();
};

const buildTmdbTranslationsUrl = ({
  tmdbId,
  type,
  tmdbKey,
  seasonNumber,
  episodeNumber,
}: {
  tmdbId: number;
  type: TmdbMediaType;
  tmdbKey: string;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
}) => {
  const basePath =
    type === 'movie'
      ? `/movie/${tmdbId}/translations`
      : seasonNumber && episodeNumber
        ? `/tv/${tmdbId}/season/${seasonNumber}/episode/${episodeNumber}/translations`
        : seasonNumber
          ? `/tv/${tmdbId}/season/${seasonNumber}/translations`
          : `/tv/${tmdbId}/translations`;
  const url = new URL(`${TMDB_API_BASE_URL}${basePath}`);
  url.searchParams.set('api_key', tmdbKey);
  return url.toString();
};

const resolveDetailsForTypes = async ({
  tmdbId,
  candidateTypes,
  tmdbKey,
  lang,
  fetchTmdbJson,
}: {
  tmdbId: number;
  candidateTypes: TmdbMediaType[];
  tmdbKey: string;
  lang: string | null;
  fetchTmdbJson: JsonFetcher;
}): Promise<TmdbTranslationTarget | null> => {
  for (const type of candidateTypes) {
    const details = await fetchTmdbJson(buildTmdbDetailsUrl(tmdbId, type, tmdbKey, lang));
    if (!details || typeof details !== 'object' || Array.isArray(details)) continue;
    return { id: tmdbId, type, details: details as Record<string, unknown> };
  }

  return null;
};

export const resolveTmdbTranslationTarget = async ({
  xrdbId,
  metaType,
  tmdbKey,
  lang,
  fetchTmdbJson,
  fetchAnimeMappingJson,
}: {
  xrdbId: string;
  metaType: unknown;
  tmdbKey: string;
  lang: string | null;
  fetchTmdbJson: JsonFetcher;
  fetchAnimeMappingJson: JsonFetcher;
}): Promise<TmdbTranslationTarget | null> => {
  if (!xrdbId) return null;

  const stremioType = normalizeStremioType(metaType);

  if (xrdbId.startsWith('tmdb:')) {
    const parts = xrdbId.split(':');
    const explicitTypeCandidate = (parts[1] || '').trim().toLowerCase();
    if ((explicitTypeCandidate === 'movie' || explicitTypeCandidate === 'tv') && parts.length >= 3) {
      const tmdbId = normalizePositiveInteger(parts[2]);
      if (tmdbId) {
        return resolveDetailsForTypes({
          tmdbId,
          candidateTypes: [explicitTypeCandidate as TmdbMediaType],
          tmdbKey,
          lang,
          fetchTmdbJson,
        });
      }
    }

    const tmdbId = normalizePositiveInteger(parts[1]);
    if (!tmdbId) return null;

    return resolveDetailsForTypes({
      tmdbId,
      candidateTypes: buildPreferredTypeOrder(stremioType),
      tmdbKey,
      lang,
      fetchTmdbJson,
    });
  }

  if (IMDB_RE.test(xrdbId)) {
    const findUrl = new URL(`${TMDB_API_BASE_URL}/find/${encodeURIComponent(xrdbId)}`);
    findUrl.searchParams.set('api_key', tmdbKey);
    findUrl.searchParams.set('external_source', 'imdb_id');
    if (lang) {
      findUrl.searchParams.set('language', lang);
    }

    const data = await fetchTmdbJson(findUrl.toString());
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

    const movieResults = Array.isArray((data as any).movie_results) ? (data as any).movie_results : [];
    const tvResults = Array.isArray((data as any).tv_results) ? (data as any).tv_results : [];
    const movieId = normalizePositiveInteger(movieResults[0]?.id);
    const tvId = normalizePositiveInteger(tvResults[0]?.id);

    const candidateRefs: Array<{ id: number | null; type: TmdbMediaType }> =
      stremioType === 'movie'
        ? [
            { id: movieId, type: 'movie' },
            { id: tvId, type: 'tv' },
          ]
        : stremioType === 'tv'
          ? [
              { id: tvId, type: 'tv' },
              { id: movieId, type: 'movie' },
            ]
          : [
              { id: movieId, type: 'movie' },
              { id: tvId, type: 'tv' },
            ];

    for (const candidateRef of candidateRefs) {
      if (!candidateRef.id) continue;
      const resolved = await resolveDetailsForTypes({
        tmdbId: candidateRef.id,
        candidateTypes: [candidateRef.type],
        tmdbKey,
        lang,
        fetchTmdbJson,
      });
      if (resolved) return resolved;
    }

    return null;
  }

  const animeLookup = parseAnimeMappingLookup(xrdbId);
  if (!animeLookup) return null;

  const mappingData = await fetchAnimeMappingJson(buildAnimeMappingUrl(animeLookup));
  if (!mappingData || typeof mappingData !== 'object' || Array.isArray(mappingData)) return null;
  if ((mappingData as any).ok === false) return null;

  const tmdbId = extractTmdbIdFromAnimeMapping(mappingData);
  if (!tmdbId) return null;

  return resolveDetailsForTypes({
    tmdbId,
    candidateTypes: getAnimeMappingTypeOrder(metaType, mappingData),
    tmdbKey,
    lang,
    fetchTmdbJson,
  });
};

const findTmdbTranslationEntry = (payload: any, requestedLanguage: string | null) => {
  const translations = Array.isArray(payload?.translations) ? payload.translations : [];
  if (translations.length === 0) return null;

  const { language, region } = normalizeLanguage(requestedLanguage);
  if (!language) return null;

  for (const translation of translations) {
    const translationLanguage = toNonEmptyString(translation?.iso_639_1)?.toLowerCase() || null;
    const translationRegion = toNonEmptyString(translation?.iso_3166_1)?.toUpperCase() || null;
    if (translationLanguage !== language) continue;
    if (region && translationRegion === region) {
      return translation;
    }
    if (!region) {
      return translation;
    }
  }

  return null;
};

const getTmdbTranslationFieldAvailabilityFromEntry = (entry: any) => {
  if (!entry || typeof entry !== 'object') {
    return { title: false, overview: false };
  }

  const data = entry?.data && typeof entry.data === 'object' ? entry.data : {};
  return {
    title: hasMeaningfulText((data as any).title) || hasMeaningfulText((data as any).name),
    overview: hasMeaningfulText((data as any).overview),
  };
};

export const resolveTmdbTranslationFieldAvailability = async ({
  tmdbId,
  type,
  tmdbKey,
  lang,
  fetchTmdbJson,
  seasonNumber,
  episodeNumber,
}: {
  tmdbId: number;
  type: TmdbMediaType;
  tmdbKey: string;
  lang: string | null;
  fetchTmdbJson: JsonFetcher;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
}): Promise<{ title: boolean | null; overview: boolean | null }> => {
  if (!lang) {
    return { title: null, overview: null };
  }

  const payload = await fetchTmdbJson(
    buildTmdbTranslationsUrl({ tmdbId, type, tmdbKey, seasonNumber, episodeNumber }),
  );
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { title: null, overview: null };
  }

  const entry = findTmdbTranslationEntry(payload, lang);
  if (!entry) {
    return { title: false, overview: false };
  }

  return getTmdbTranslationFieldAvailabilityFromEntry(entry);
};

const normalizeKitsuTitleKey = (value: string) => value.trim().toLowerCase().replace(/-/g, '_');

const findLocalizedKitsuTitle = (
  titles: Record<string, unknown>,
  requestedLanguage: string | null,
) => {
  const normalizedTitles = new Map<string, string>();
  for (const [rawKey, rawValue] of Object.entries(titles)) {
    const value = toNonEmptyString(rawValue);
    if (!value) continue;
    normalizedTitles.set(normalizeKitsuTitleKey(rawKey), value);
  }

  const { language, region } = normalizeLanguage(requestedLanguage);
  if (!language) {
    return null;
  }

  const keysToTry: string[] = [];
  if (region) {
    keysToTry.push(`${language}_${region.toLowerCase()}`);
  }
  keysToTry.push(language);

  for (const key of normalizedTitles.keys()) {
    if (key.startsWith(`${language}_`) && !keysToTry.includes(key)) {
      keysToTry.push(key);
    }
  }

  for (const key of keysToTry) {
    const value = normalizedTitles.get(key);
    if (value) {
      return {
        value,
        exactRequestedLanguage: key === language || key.startsWith(`${language}_`),
      };
    }
  }

  return null;
};

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, ' ');

const stripHtmlToText = (value: string) =>
  decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, '\n\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim(),
  );

const extractTitleCandidateFromTmdbDetails = (details: Record<string, unknown> | null) => {
  if (!details) return null;
  if (typeof details.title === 'string') return details.title;
  if (typeof details.name === 'string') return details.name;
  return null;
};

const extractOverviewCandidateFromTmdbDetails = (details: Record<string, unknown> | null) => {
  if (!details) return null;
  return typeof details.overview === 'string' ? details.overview : null;
};

const buildAnimeTitleCandidate = ({
  kitsuTitles,
  kitsuCanonicalTitle,
  aniListTitle,
  requestedLanguage,
}: {
  kitsuTitles: Record<string, unknown>;
  kitsuCanonicalTitle: string | null;
  aniListTitle: any;
  requestedLanguage: string | null;
}): AnimeTextFallback['title'] => {
  const { language } = normalizeLanguage(requestedLanguage);

  const kitsuLocalized = findLocalizedKitsuTitle(kitsuTitles, requestedLanguage);
  if (kitsuLocalized) {
    return {
      value: kitsuLocalized.value,
      source: 'kitsu',
      exactRequestedLanguage: kitsuLocalized.exactRequestedLanguage,
    };
  }

  const aniEnglish = toNonEmptyString(aniListTitle?.english);
  const aniNative = toNonEmptyString(aniListTitle?.native);
  const aniRomaji = toNonEmptyString(aniListTitle?.romaji);
  const aniPreferred = toNonEmptyString(aniListTitle?.userPreferred);

  if (language === 'ja' && aniNative) {
    return {
      value: aniNative,
      source: 'anilist',
      exactRequestedLanguage: true,
    };
  }

  if (language === 'en' && aniEnglish) {
    return {
      value: aniEnglish,
      source: 'anilist',
      exactRequestedLanguage: true,
    };
  }

  const kitsuEnglish =
    toNonEmptyString(kitsuTitles.en) ||
    toNonEmptyString(kitsuTitles.en_us) ||
    toNonEmptyString(kitsuTitles.en_jp);
  if (kitsuEnglish) {
    return {
      value: kitsuEnglish,
      source: 'kitsu',
      exactRequestedLanguage: language === 'en',
    };
  }

  if (aniEnglish) {
    return {
      value: aniEnglish,
      source: 'anilist',
      exactRequestedLanguage: language === 'en',
    };
  }

  if (aniPreferred) {
    return {
      value: aniPreferred,
      source: 'anilist',
      exactRequestedLanguage: false,
    };
  }

  if (aniRomaji) {
    return {
      value: aniRomaji,
      source: 'anilist',
      exactRequestedLanguage: false,
    };
  }

  if (kitsuCanonicalTitle) {
    return {
      value: kitsuCanonicalTitle,
      source: 'kitsu',
      exactRequestedLanguage: false,
    };
  }

  if (aniNative) {
    return {
      value: aniNative,
      source: 'anilist',
      exactRequestedLanguage: language === 'ja',
    };
  }

  return {
    value: null,
    source: null,
    exactRequestedLanguage: null,
  };
};

const buildAnimeOverviewCandidate = ({
  kitsuOverview,
  aniListOverview,
  requestedLanguage,
}: {
  kitsuOverview: string | null;
  aniListOverview: string | null;
  requestedLanguage: string | null;
}): AnimeTextFallback['overview'] => {
  const { language } = normalizeLanguage(requestedLanguage);

  if (kitsuOverview) {
    return {
      value: kitsuOverview,
      source: 'kitsu',
      exactRequestedLanguage: language === 'en',
    };
  }

  if (aniListOverview) {
    return {
      value: aniListOverview,
      source: 'anilist',
      exactRequestedLanguage: language === 'en',
    };
  }

  return {
    value: null,
    source: null,
    exactRequestedLanguage: null,
  };
};

export const resolveAnimeTextFallback = async ({
  xrdbId,
  lang,
  fetchAnimeMappingJson,
  fetchKitsuJson,
  fetchAniListMediaJson,
}: {
  xrdbId: string;
  lang: string | null;
  fetchAnimeMappingJson: JsonFetcher;
  fetchKitsuJson: JsonFetcher;
  fetchAniListMediaJson: AniListMediaFetcher;
}): Promise<AnimeTextFallback | null> => {
  const animeLookup = parseAnimeMappingLookup(xrdbId);
  if (!animeLookup) return null;

  const mappingData = await fetchAnimeMappingJson(buildAnimeMappingUrl(animeLookup));
  if (!mappingData || typeof mappingData !== 'object' || Array.isArray(mappingData)) return null;
  if ((mappingData as any).ok === false) return null;

  const mappingKitsuTitles =
    (mappingData as any)?.kitsu?.titles && typeof (mappingData as any).kitsu.titles === 'object'
      ? ((mappingData as any).kitsu.titles as Record<string, unknown>)
      : {};
  let kitsuTitles = mappingKitsuTitles;
  let kitsuCanonicalTitle = toNonEmptyString((mappingData as any)?.kitsu?.canonicalTitle);
  let kitsuOverview: string | null = null;

  const resolvedKitsuId =
    toNonEmptyString((mappingData as any)?.requested?.resolvedKitsuId) ||
    toNonEmptyString((mappingData as any)?.kitsu?.id);
  if (resolvedKitsuId) {
    const kitsuData = await fetchKitsuJson(`${KITSU_API_BASE_URL}/anime/${encodeURIComponent(resolvedKitsuId)}`);
    const kitsuAttributes =
      kitsuData &&
      typeof kitsuData === 'object' &&
      !Array.isArray(kitsuData) &&
      (kitsuData as any)?.data?.attributes &&
      typeof (kitsuData as any).data.attributes === 'object'
        ? ((kitsuData as any).data.attributes as Record<string, unknown>)
        : null;

    if (kitsuAttributes) {
      const kitsuTitlesRecord =
        kitsuAttributes.titles && typeof kitsuAttributes.titles === 'object'
          ? (kitsuAttributes.titles as Record<string, unknown>)
          : {};
      if (kitsuAttributes.titles && typeof kitsuAttributes.titles === 'object') {
        kitsuTitles = kitsuTitlesRecord;
      }
      kitsuCanonicalTitle =
        toNonEmptyString(kitsuAttributes.canonicalTitle) ||
        toNonEmptyString(kitsuTitlesRecord.en) ||
        kitsuCanonicalTitle;
      kitsuOverview =
        toNonEmptyString(kitsuAttributes.synopsis) ||
        toNonEmptyString(kitsuAttributes.description) ||
        null;
    }
  }

  let aniListTitle: any = null;
  let aniListOverview: string | null = null;
  const aniListId = normalizePositiveInteger((mappingData as any)?.mappings?.ids?.anilist);
  if (aniListId) {
    const aniListPayload = await fetchAniListMediaJson(String(aniListId));
    const media =
      aniListPayload &&
      typeof aniListPayload === 'object' &&
      !Array.isArray(aniListPayload) &&
      (aniListPayload as any)?.data?.Media &&
      typeof (aniListPayload as any).data.Media === 'object'
        ? (aniListPayload as any).data.Media
        : null;

    if (media) {
      aniListTitle = media.title;
      aniListOverview = hasNonEmptyText(media.description)
        ? stripHtmlToText(String(media.description))
        : null;
    }
  }

  return {
    title: buildAnimeTitleCandidate({
      kitsuTitles,
      kitsuCanonicalTitle,
      aniListTitle,
      requestedLanguage: lang,
    }),
    overview: buildAnimeOverviewCandidate({
      kitsuOverview,
      aniListOverview,
      requestedLanguage: lang,
    }),
  };
};

const buildExistingFieldState = (
  target: Record<string, unknown>,
  keys: readonly string[],
  fallbackKey: string,
): ExistingFieldState => {
  const key = keys.find((candidate) => candidate in target) || fallbackKey;

  let value: string | null = null;
  let hasNonEmptyTextValue = false;
  let hasMeaningfulTextValue = false;
  let sawDefinedKey = false;
  let sawBlankText = false;
  let sawPlaceholderText = false;

  for (const candidate of keys) {
    if (!(candidate in target)) continue;
    sawDefinedKey = true;
    const candidateValue = target[candidate];
    const normalized = toNonEmptyString(candidateValue);
    if (!normalized) {
      if (typeof candidateValue === 'string' || candidateValue === null || candidateValue === undefined) {
        sawBlankText = true;
      }
      continue;
    }

    hasNonEmptyTextValue = true;
    if (!value) {
      value = normalized;
    }

    if (PLACEHOLDER_TEXT_SET.has(normalized.toLowerCase())) {
      sawPlaceholderText = true;
      continue;
    }

    hasMeaningfulTextValue = true;
    value = normalized;
    break;
  }

  const status: TextFieldStatus = hasMeaningfulTextValue
    ? 'present'
    : sawPlaceholderText
      ? 'placeholder'
      : sawBlankText || sawDefinedKey
        ? 'blank'
        : 'missing';

  return {
    key,
    status,
    value,
    hasNonEmptyText: hasNonEmptyTextValue,
    hasMeaningfulText: hasMeaningfulTextValue,
  };
};

const fillReasonForStatus = (
  status: TextFieldStatus,
  fallbackReason: Extract<TextFieldReason, 'filled-missing' | 'filled-blank' | 'filled-placeholder'>,
) => {
  if (status === 'missing') return 'filled-missing';
  if (status === 'blank') return 'filled-blank';
  if (status === 'placeholder') return 'filled-placeholder';
  return fallbackReason;
};

const selectFieldCandidate = ({
  existing,
  mode,
  tmdb,
  anime,
}: {
  existing: ExistingFieldState;
  mode: MetadataTranslationMode;
  tmdb: FieldCandidate;
  anime: FieldCandidate;
}) => {
  const hasTmdb = hasMeaningfulText(tmdb.value);
  const hasAnime = hasMeaningfulText(anime.value);
  const preserveExisting = mode === 'prefer-source' ? existing.hasNonEmptyText : existing.hasMeaningfulText;

  if (mode === 'prefer-tmdb' && hasTmdb) {
    return { candidate: tmdb, reason: 'preferred-tmdb' as TextFieldReason };
  }

  if (mode === 'prefer-requested-language' && hasTmdb && tmdb.exactRequestedLanguage === true) {
    return { candidate: tmdb, reason: 'preferred-requested-language' as TextFieldReason };
  }

  if (preserveExisting) {
    return {
      candidate: {
        value: existing.value,
        source: 'source' as TranslationFieldSource,
        exactRequestedLanguage: null,
      },
      reason: 'preserved-source' as TextFieldReason,
    };
  }

  if (mode === 'prefer-requested-language' && hasAnime && anime.exactRequestedLanguage === true) {
    return {
      candidate: anime,
      reason: 'fallback-anime' as TextFieldReason,
    };
  }

  if (hasTmdb) {
    return {
      candidate: tmdb,
      reason: fillReasonForStatus(existing.status, 'filled-missing'),
    };
  }

  if (hasAnime) {
    return {
      candidate: anime,
      reason: 'fallback-anime' as TextFieldReason,
    };
  }

  if (existing.hasNonEmptyText) {
    return {
      candidate: {
        value: existing.value,
        source: 'source' as TranslationFieldSource,
        exactRequestedLanguage: null,
      },
      reason: 'preserved-source' as TextFieldReason,
    };
  }

  return {
    candidate: {
      value: null,
      source: 'none' as TranslationFieldSource,
      exactRequestedLanguage: null,
    },
    reason: 'unavailable' as TextFieldReason,
  };
};

const applyFieldSelection = (
  target: Record<string, unknown>,
  keys: readonly string[],
  fallbackKey: string,
  mode: MetadataTranslationMode,
  primaryCandidate: FieldCandidate,
  secondaryCandidate: FieldCandidate,
) => {
  const existing = buildExistingFieldState(target, keys, fallbackKey);
  const { candidate, reason } = selectFieldCandidate({
    existing,
    mode,
    tmdb: primaryCandidate,
    anime: secondaryCandidate,
  });

  const changed =
    candidate.source !== 'none' &&
    candidate.source !== 'source' &&
    hasMeaningfulText(candidate.value) &&
    candidate.value !== existing.value;

  if (changed && candidate.value) {
    target[existing.key] = candidate.value;
  }

  return {
    source: candidate.source,
    reason,
    existingStatus: existing.status,
    outputKey: existing.key,
    exactRequestedLanguage: candidate.source === 'source' || candidate.source === 'none'
      ? null
      : candidate.exactRequestedLanguage,
    changed,
  } satisfies TextFieldDebug;
};

export const applyTranslatedTextFields = (
  target: Record<string, unknown>,
  options: ApplyTranslatedTextFieldsOptions = {},
): AppliedTextTranslationDebug => {
  const mode = normalizeMetadataTranslationMode(
    options.mode ?? DEFAULT_METADATA_TRANSLATION_MODE,
    DEFAULT_METADATA_TRANSLATION_MODE,
  );

  const title = applyFieldSelection(
    target,
    TITLE_FIELD_KEYS,
    'name',
    mode,
    {
      value: options.tmdbTitle ?? null,
      source: 'tmdb',
      exactRequestedLanguage: options.tmdbTitleExactRequestedLanguage ?? null,
    },
    {
      value: options.animeTitle ?? null,
      source: options.animeTitleSource ?? 'none',
      exactRequestedLanguage: options.animeTitleExactRequestedLanguage ?? null,
    },
  );

  const overview = applyFieldSelection(
    target,
    OVERVIEW_FIELD_KEYS,
    'description',
    mode,
    {
      value: options.tmdbOverview ?? null,
      source: 'tmdb',
      exactRequestedLanguage: options.tmdbOverviewExactRequestedLanguage ?? null,
    },
    {
      value: options.animeOverview ?? null,
      source: options.animeOverviewSource ?? 'none',
      exactRequestedLanguage: options.animeOverviewExactRequestedLanguage ?? null,
    },
  );

  return { title, overview };
};

export const mergeTranslatedTextFields = (
  target: Record<string, unknown>,
  translatedTitle: string | null,
  translatedOverview: string | null,
) => {
  applyTranslatedTextFields(target, {
    tmdbTitle: translatedTitle,
    tmdbOverview: translatedOverview,
  });
  return target;
};

export const extractTmdbTextCandidates = (details: Record<string, unknown> | null) => ({
  title: extractTitleCandidateFromTmdbDetails(details),
  overview: extractOverviewCandidateFromTmdbDetails(details),
});
