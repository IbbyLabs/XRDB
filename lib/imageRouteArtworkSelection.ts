import {
  ANILIST_EPISODE_THUMBNAIL_QUERY,
  ANILIST_GRAPHQL_URL,
  DEFAULT_RANDOM_POSTER_FALLBACK_MODE,
  DEFAULT_RANDOM_POSTER_LANGUAGE_MODE,
  DEFAULT_RANDOM_POSTER_TEXT_MODE,
  FALLBACK_IMAGE_LANGUAGE,
  KITSU_CACHE_TTL_MS,
  TMDB_CACHE_TTL_MS,
  type ArtworkSource,
  type EpisodeArtworkMode,
  type PosterTextPreference,
  type RandomPosterFallbackMode,
  type RandomPosterLanguageMode,
  type RandomPosterTextMode,
} from './imageRouteConfig.ts';
import { fetchAniListIdFromReverseMapping } from './imageRouteAnimeReverse.ts';
import { resolveOmdbPosterUrl } from './imageRouteOmdb.ts';
import { pickByLanguageWithFallback } from './imageLanguage.ts';
import { BROWSER_LIKE_USER_AGENT } from './imageRouteExternalRatings.ts';
import { fetchFanartArtwork } from './imageRouteFanart.ts';
import type { PhaseDurations, CachedJsonResponse } from './imageRouteRuntime.ts';
import {
  buildCinemetaBackdropUrl,
  buildCinemetaLogoUrl,
  buildCinemetaPosterUrl,
  buildTmdbImageUrl,
} from './imageRouteSourceUrls.ts';
import {
  isTextlessPosterSelection,
  pickBackdropByPreference,
  pickDeterministicItemBySeed,
  pickFanartUrlByPreference,
  pickPosterByPreference,
} from './imageRouteSelection.ts';

type ArtworkFetchJson = (
  key: string,
  url: string,
  ttlMs: number,
  phases: PhaseDurations,
  phase: keyof PhaseDurations,
  init?: RequestInit,
) => Promise<CachedJsonResponse>;

type TmdbImageAsset = {
  file_path?: string | null;
  iso_639_1?: string | null;
  aspect_ratio?: number | null;
};

type FanartArtworkPayload = {
  posterUrls: string[];
  backdropUrls: string[];
  logoUrls: string[];
};

type MediaImageRecord = {
  id?: number | string | null;
  imdb_id?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
};

type DetailsImageRecord = {
  poster_path?: string | null;
  backdrop_path?: string | null;
};

type ArtworkSelectionInput = {
  posters: TmdbImageAsset[];
  backdrops: TmdbImageAsset[];
  logos: TmdbImageAsset[];
  seasonIncludeImageLanguage?: string;
};

export type ArtworkSelectionResult = {
  imgPath: string;
  imgUrlOverride: string | null;
  logoAspectRatio: number | null;
  logoPath: string | null;
  posterIsTextless: boolean;
};

type ArtworkSelectorDeps = {
  fetchFanartArtwork: typeof fetchFanartArtwork;
  resolveOmdbPosterUrl: typeof resolveOmdbPosterUrl;
};

const DEFAULT_DEPS: ArtworkSelectorDeps = {
  fetchFanartArtwork,
  resolveOmdbPosterUrl,
};

export const createImageRouteArtworkSelector = (
  input: {
    imageType: 'poster' | 'backdrop' | 'logo';
    isThumbnailRequest: boolean;
    mediaType: 'movie' | 'tv';
    media: MediaImageRecord;
    details: DetailsImageRecord | null;
    requestedImageLang: string;
    fallbackImageLang?: string;
    posterTextPreference: PosterTextPreference;
    randomPosterTextMode: RandomPosterTextMode;
    randomPosterLanguageMode: RandomPosterLanguageMode;
    randomPosterMinVoteCount: number | null;
    randomPosterMinVoteAverage: number | null;
    randomPosterMinWidth: number | null;
    randomPosterMinHeight: number | null;
    randomPosterFallbackMode: RandomPosterFallbackMode;
    posterArtworkSource: ArtworkSource;
    backdropArtworkSource: ArtworkSource;
    logoArtworkSource: ArtworkSource;
    thumbnailEpisodeArtwork: EpisodeArtworkMode;
    backdropEpisodeArtwork: EpisodeArtworkMode;
    artworkSelectionSeed: string;
    cleanId: string;
    season: string | null;
    episode: string | null;
    isKitsu: boolean;
    tmdbKey: string;
    fanartKey: string;
    fanartClientKey: string;
    fanartTvdbId?: string | null;
    phases: PhaseDurations;
    fetchJsonCached: ArtworkFetchJson;
    getRemoteImageAspectRatio: (url: string) => Promise<number | null>;
    resolveImdbId: () => Promise<string | null>;
  },
  deps: Partial<ArtworkSelectorDeps> = {},
) => {
  const runtimeDeps = { ...DEFAULT_DEPS, ...deps };
  const fallbackImageLang = input.fallbackImageLang || FALLBACK_IMAGE_LANGUAGE;
  const buildArtworkSeed = (scope: string) =>
    `${scope}:${input.artworkSelectionSeed || `${input.cleanId}:${input.imageType}`}`;
  let fanartArtworkPromise: Promise<FanartArtworkPayload | null> | null = null;
  let omdbPosterUrlPromise: Promise<string | null> | null = null;

  const getFanartArtwork = async () => {
    if (!(input.mediaType === 'movie' || input.mediaType === 'tv')) return null;
    if (fanartArtworkPromise) return fanartArtworkPromise;
    fanartArtworkPromise = runtimeDeps.fetchFanartArtwork({
      mediaType: input.mediaType,
      tmdbId: String(input.media.id),
      tvdbId: input.mediaType === 'tv' ? input.fanartTvdbId || null : null,
      fanartKey: input.fanartKey,
      fanartClientKey: input.fanartClientKey,
      requestedLang: input.requestedImageLang,
      fallbackLang: fallbackImageLang,
      phases: input.phases,
      fetchJsonCached: input.fetchJsonCached,
    });
    return fanartArtworkPromise;
  };

  const getOmdbPosterUrl = async () => {
    if (omdbPosterUrlPromise) return omdbPosterUrlPromise;
    omdbPosterUrlPromise = (async () => {
      const imdbId = await input.resolveImdbId();
      if (!imdbId) return null;
      return runtimeDeps.resolveOmdbPosterUrl({
        imdbId,
        phases: input.phases,
        fetchJsonCached: input.fetchJsonCached,
      });
    })();
    return omdbPosterUrlPromise;
  };

  return async (selectionInput: ArtworkSelectionInput): Promise<ArtworkSelectionResult> => {
    let posterCollection = selectionInput.posters || [];
    let backdropCollection = selectionInput.backdrops || [];
    const logoCollection = selectionInput.logos || [];

    const selectedLogo = pickByLanguageWithFallback(
      logoCollection,
      input.requestedImageLang,
      fallbackImageLang,
    );
    const scopedLogoCollection = logoCollection.filter((logo) => {
      const language = String(logo?.iso_639_1 || '').trim().toLowerCase();
      return !language || language === input.requestedImageLang || language === fallbackImageLang;
    });
    const randomLogoCandidate = pickDeterministicItemBySeed(
      [...new Map(
        scopedLogoCollection
          .filter((logo) => typeof logo?.file_path === 'string' && logo.file_path.trim())
          .map((logo) => [String(logo.file_path), logo] as const)
      ).values()],
      buildArtworkSeed('tmdb-logo'),
    );
    const defaultLogoPath = selectedLogo?.file_path || null;
    const randomLogoPath = randomLogoCandidate?.file_path || defaultLogoPath;
    const logoPath = input.logoArtworkSource === 'random' ? randomLogoPath : defaultLogoPath;

    const localizedPosterPath =
      pickByLanguageWithFallback(posterCollection, input.requestedImageLang, fallbackImageLang)?.file_path || null;
    let originalPosterPath =
      localizedPosterPath ||
      input.details?.poster_path ||
      input.media?.poster_path ||
      posterCollection[0]?.file_path;
    const localizedBackdropPath =
      pickByLanguageWithFallback(backdropCollection, input.requestedImageLang, fallbackImageLang)?.file_path || null;
    let episodeStillPath: string | null = null;

    if (
      input.imageType === 'backdrop' &&
      !input.isThumbnailRequest &&
      input.backdropEpisodeArtwork === 'still' &&
      input.mediaType === 'tv' &&
      input.season &&
      input.episode
    ) {
      const episodeDetailsResponse = await input.fetchJsonCached(
        `tmdb:tv:${input.media.id}:season:${input.season}:episode:${input.episode}:details`,
        `https://api.themoviedb.org/3/tv/${input.media.id}/season/${input.season}/episode/${input.episode}?api_key=${input.tmdbKey}`,
        TMDB_CACHE_TTL_MS,
        input.phases,
        'tmdb',
      );
      if (episodeDetailsResponse.ok) {
        const rawStillPath = episodeDetailsResponse.data?.still_path;
        episodeStillPath =
          typeof rawStillPath === 'string' && rawStillPath.trim().length > 0
            ? rawStillPath.trim()
            : null;
        if (episodeStillPath) {
          backdropCollection = [
            { file_path: episodeStillPath, iso_639_1: null },
            ...backdropCollection.filter((backdrop) => backdrop?.file_path !== episodeStillPath),
          ];
        }
      }
    }

    const originalBackdropPath =
      episodeStillPath ||
      localizedBackdropPath ||
      input.details?.backdrop_path ||
      input.media?.backdrop_path ||
      backdropCollection[0]?.file_path;

    if (input.isKitsu && input.season && !input.episode && input.imageType === 'poster') {
      const seasonImagesQuery = selectionInput.seasonIncludeImageLanguage
        ? `&include_image_language=${selectionInput.seasonIncludeImageLanguage}`
        : '';
      const seasonImagesCacheKey = selectionInput.seasonIncludeImageLanguage
        ? `tmdb:season_images:${input.media.id}:${input.season}:${selectionInput.seasonIncludeImageLanguage}`
        : `tmdb:season_images:${input.media.id}:${input.season}:all`;

      const [seasonDetailsResponse, seasonImagesResponse] = await Promise.all([
        input.fetchJsonCached(
          `tmdb:season_details:${input.media.id}:${input.season}:${input.requestedImageLang}`,
          `https://api.themoviedb.org/3/tv/${input.media.id}/season/${input.season}?api_key=${input.tmdbKey}&language=${input.requestedImageLang}`,
          TMDB_CACHE_TTL_MS,
          input.phases,
          'tmdb',
        ),
        input.fetchJsonCached(
          seasonImagesCacheKey,
          `https://api.themoviedb.org/3/tv/${input.media.id}/season/${input.season}/images?api_key=${input.tmdbKey}${seasonImagesQuery}`,
          TMDB_CACHE_TTL_MS,
          input.phases,
          'tmdb',
        ),
      ]);

      let seasonPosterPath: string | null = null;
      if (seasonDetailsResponse.ok && typeof seasonDetailsResponse.data?.poster_path === 'string') {
        seasonPosterPath = seasonDetailsResponse.data.poster_path;
      }

      if (!seasonPosterPath && input.requestedImageLang !== fallbackImageLang) {
        const seasonFallbackDetailsResponse = await input.fetchJsonCached(
          `tmdb:season_details:${input.media.id}:${input.season}:${fallbackImageLang}`,
          `https://api.themoviedb.org/3/tv/${input.media.id}/season/${input.season}?api_key=${input.tmdbKey}&language=${fallbackImageLang}`,
          TMDB_CACHE_TTL_MS,
          input.phases,
          'tmdb',
        );
        if (seasonFallbackDetailsResponse.ok && typeof seasonFallbackDetailsResponse.data?.poster_path === 'string') {
          seasonPosterPath = seasonFallbackDetailsResponse.data.poster_path;
        }
      }

      if (seasonImagesResponse.ok && Array.isArray(seasonImagesResponse.data?.posters) && seasonImagesResponse.data.posters.length > 0) {
        posterCollection = seasonImagesResponse.data.posters as TmdbImageAsset[];
      }

      originalPosterPath =
        seasonPosterPath ||
        pickByLanguageWithFallback(posterCollection, input.requestedImageLang, fallbackImageLang)?.file_path ||
        originalPosterPath;
    }

    if (input.imageType === 'poster') {
      const selectedPoster = pickPosterByPreference(
        posterCollection,
        input.posterTextPreference,
        input.requestedImageLang,
        fallbackImageLang,
        originalPosterPath,
        buildArtworkSeed('tmdb-poster'),
        {
          randomPosterTextMode: input.randomPosterTextMode || DEFAULT_RANDOM_POSTER_TEXT_MODE,
          randomPosterLanguageMode:
            input.randomPosterLanguageMode || DEFAULT_RANDOM_POSTER_LANGUAGE_MODE,
          randomPosterMinVoteCount: input.randomPosterMinVoteCount,
          randomPosterMinVoteAverage: input.randomPosterMinVoteAverage,
          randomPosterMinWidth: input.randomPosterMinWidth,
          randomPosterMinHeight: input.randomPosterMinHeight,
          randomPosterFallbackMode:
            input.randomPosterFallbackMode || DEFAULT_RANDOM_POSTER_FALLBACK_MODE,
        },
      );
      const posterIsTextless = isTextlessPosterSelection(posterCollection, selectedPoster);

      if (input.posterArtworkSource === 'random') {
        const randomPosterCandidates: Array<{
          imgPath?: string;
          imgUrlOverride?: string;
          logoPath?: string | null;
          posterIsTextless?: boolean;
        }> = [];

        if (selectedPoster?.file_path) {
          randomPosterCandidates.push({
            imgPath: selectedPoster.file_path,
            logoPath,
            posterIsTextless,
          });
        }

        if (input.mediaType === 'movie' || input.mediaType === 'tv') {
          const fanartArtwork = await getFanartArtwork();
          const fanartPosterUrl = pickFanartUrlByPreference(
            fanartArtwork?.posterUrls || [],
            'random',
            buildArtworkSeed('fanart-poster'),
          );
          if (fanartPosterUrl) {
            randomPosterCandidates.push({
              imgUrlOverride: fanartPosterUrl,
              logoPath:
                pickDeterministicItemBySeed(
                  fanartArtwork?.logoUrls || [],
                  buildArtworkSeed('fanart-logo'),
                ) || logoPath,
              posterIsTextless: false,
            });
          }
        }

        const imdbId = await input.resolveImdbId();
        if (imdbId) {
          randomPosterCandidates.push({
            imgUrlOverride: buildCinemetaPosterUrl(imdbId),
            logoPath,
            posterIsTextless: false,
          });
        }

        const omdbPosterUrl = await getOmdbPosterUrl();
        if (omdbPosterUrl) {
          randomPosterCandidates.push({
            imgUrlOverride: omdbPosterUrl,
            logoPath,
            posterIsTextless: false,
          });
        }

        const randomPosterChoice = pickDeterministicItemBySeed(
          randomPosterCandidates,
          buildArtworkSeed('poster-source'),
        );
        if (randomPosterChoice) {
          return {
            imgPath: randomPosterChoice.imgPath || '',
            imgUrlOverride: randomPosterChoice.imgUrlOverride || null,
            logoAspectRatio: null,
            logoPath: randomPosterChoice.logoPath || logoPath,
            posterIsTextless: randomPosterChoice.posterIsTextless === true,
          };
        }
      }

      if (input.posterArtworkSource === 'cinemeta') {
        const imdbId = await input.resolveImdbId();
        if (imdbId) {
          return {
            imgPath: '',
            imgUrlOverride: buildCinemetaPosterUrl(imdbId),
            logoAspectRatio: null,
            logoPath,
            posterIsTextless: false,
          };
        }
      }

      if (input.posterArtworkSource === 'omdb') {
        const omdbPosterUrl = await getOmdbPosterUrl();
        if (omdbPosterUrl) {
          return {
            imgPath: '',
            imgUrlOverride: omdbPosterUrl,
            logoAspectRatio: null,
            logoPath,
            posterIsTextless: false,
          };
        }
      }

      if (input.posterArtworkSource === 'fanart' && (input.mediaType === 'movie' || input.mediaType === 'tv')) {
        const fanartArtwork = await getFanartArtwork();
        const fanartPosterUrl = pickFanartUrlByPreference(
          fanartArtwork?.posterUrls || [],
          input.posterTextPreference,
          buildArtworkSeed('fanart-poster'),
        );
        if (fanartPosterUrl) {
          return {
            imgPath: '',
            imgUrlOverride: fanartPosterUrl,
            logoAspectRatio: null,
            logoPath:
              pickDeterministicItemBySeed(
                fanartArtwork?.logoUrls || [],
                buildArtworkSeed('fanart-logo'),
              ) || logoPath,
            posterIsTextless: false,
          };
        }
      }

      const imdbId = selectedPoster?.file_path ? null : await input.resolveImdbId();
      return {
        imgPath: selectedPoster?.file_path || '',
        imgUrlOverride: !selectedPoster?.file_path && imdbId ? buildCinemetaPosterUrl(imdbId) : null,
        logoAspectRatio: null,
        logoPath,
        posterIsTextless,
      };
    }

    if (input.imageType === 'backdrop') {
      if (
        input.isThumbnailRequest &&
        input.thumbnailEpisodeArtwork === 'still' &&
        input.mediaType === 'tv' &&
        input.season &&
        input.episode
      ) {
        const episodeCacheKeyBase = `tmdb:tv:${input.media.id}:season:${input.season}:episode:${input.episode}`;
        const episodeResponse = await input.fetchJsonCached(
          `${episodeCacheKeyBase}:${input.requestedImageLang}`,
          `https://api.themoviedb.org/3/tv/${input.media.id}/season/${input.season}/episode/${input.episode}?api_key=${input.tmdbKey}&language=${input.requestedImageLang}`,
          TMDB_CACHE_TTL_MS,
          input.phases,
          'tmdb',
        );
        const episodeDetails =
          episodeResponse.ok && episodeResponse.data
            ? episodeResponse.data
            : input.requestedImageLang !== fallbackImageLang
              ? (
                  await input.fetchJsonCached(
                    `${episodeCacheKeyBase}:${fallbackImageLang}`,
                    `https://api.themoviedb.org/3/tv/${input.media.id}/season/${input.season}/episode/${input.episode}?api_key=${input.tmdbKey}&language=${fallbackImageLang}`,
                    TMDB_CACHE_TTL_MS,
                    input.phases,
                    'tmdb',
                  )
                ).data
              : null;
        const stillPath = typeof episodeDetails?.still_path === 'string' ? episodeDetails.still_path.trim() : '';
        if (stillPath) {
          return {
            imgPath: stillPath,
            imgUrlOverride: null,
            logoAspectRatio: null,
            logoPath,
            posterIsTextless: false,
          };
        }

        const episodeImagesResponse = await input.fetchJsonCached(
          `${episodeCacheKeyBase}:images`,
          `https://api.themoviedb.org/3/tv/${input.media.id}/season/${input.season}/episode/${input.episode}/images?api_key=${input.tmdbKey}`,
          TMDB_CACHE_TTL_MS,
          input.phases,
          'tmdb',
        );
        const imagesStills = Array.isArray(episodeImagesResponse.data?.stills)
          ? episodeImagesResponse.data.stills
          : [];
        const imagesStillPath =
          imagesStills.length > 0 &&
          typeof imagesStills[0]?.file_path === 'string' &&
          imagesStills[0].file_path.trim().length > 0
            ? imagesStills[0].file_path.trim()
            : '';
        if (imagesStillPath) {
          return {
            imgPath: imagesStillPath,
            imgUrlOverride: null,
            logoAspectRatio: null,
            logoPath,
            posterIsTextless: false,
          };
        }

        const nullLangEpisodeResponse = await input.fetchJsonCached(
          `${episodeCacheKeyBase}:nolang`,
          `https://api.themoviedb.org/3/tv/${input.media.id}/season/${input.season}/episode/${input.episode}?api_key=${input.tmdbKey}`,
          TMDB_CACHE_TTL_MS,
          input.phases,
          'tmdb',
        );
        const nullLangStillPath =
          nullLangEpisodeResponse.ok &&
          typeof nullLangEpisodeResponse.data?.still_path === 'string'
            ? nullLangEpisodeResponse.data.still_path.trim()
            : '';
        if (nullLangStillPath) {
          return {
            imgPath: nullLangStillPath,
            imgUrlOverride: null,
            logoAspectRatio: null,
            logoPath,
            posterIsTextless: false,
          };
        }

        const aniListId = await fetchAniListIdFromReverseMapping({
          provider: 'tmdb',
          externalId: String(input.media.id),
          season: input.season,
          episode: input.episode,
          phases: input.phases,
          fetchJsonCached: input.fetchJsonCached,
        });

        if (aniListId) {
          const parsedAniListId = Number.parseInt(aniListId, 10);
          if (Number.isFinite(parsedAniListId) && parsedAniListId > 0) {
            const aniListResponse = await input.fetchJsonCached(
              `anilist:anime:${parsedAniListId}:episodes`,
              ANILIST_GRAPHQL_URL,
              KITSU_CACHE_TTL_MS,
              input.phases,
              'tmdb',
              {
                method: 'POST',
                headers: {
                  'content-type': 'application/json',
                  accept: 'application/json',
                  'User-Agent': BROWSER_LIKE_USER_AGENT,
                },
                body: JSON.stringify({
                  query: ANILIST_EPISODE_THUMBNAIL_QUERY,
                  variables: { id: parsedAniListId },
                }),
              },
            );

            const streamingEpisodes = Array.isArray(
              aniListResponse.data?.data?.Media?.streamingEpisodes,
            )
              ? aniListResponse.data.data.Media.streamingEpisodes
              : [];

            const episodeNum = Number.parseInt(input.episode, 10);
            const episodePattern = Number.isFinite(episodeNum)
              ? new RegExp(`(?:Episode|E)\\s*0*${episodeNum}\\b`, 'i')
              : null;

            const matched =
              (episodePattern
                ? streamingEpisodes.find(
                    (ep: { title?: string; thumbnail?: string }) =>
                      typeof ep?.title === 'string' && episodePattern.test(ep.title),
                  )
                : null) ??
              (Number.isFinite(episodeNum) &&
              episodeNum > 0 &&
              episodeNum <= streamingEpisodes.length
                ? streamingEpisodes[episodeNum - 1]
                : null);

            const aniListThumbnail =
              typeof matched?.thumbnail === 'string' ? matched.thumbnail.trim() : '';
            if (aniListThumbnail) {
              return {
                imgPath: '',
                imgUrlOverride: aniListThumbnail,
                logoAspectRatio: null,
                logoPath,
                posterIsTextless: false,
              };
            }
          }
        }
      }

      const selectedBackdrop = pickBackdropByPreference(
        backdropCollection,
        input.posterTextPreference,
        input.requestedImageLang,
        fallbackImageLang,
        originalBackdropPath,
        buildArtworkSeed('tmdb-backdrop'),
      );

      if (input.backdropArtworkSource === 'random') {
        const randomBackdropCandidates: Array<{ imgPath?: string; imgUrlOverride?: string }> = [];

        if (selectedBackdrop?.file_path) {
          randomBackdropCandidates.push({
            imgPath: selectedBackdrop.file_path,
          });
        }

        if (input.mediaType === 'movie' || input.mediaType === 'tv') {
          const fanartArtwork = await getFanartArtwork();
          const fanartBackdropUrl = pickFanartUrlByPreference(
            fanartArtwork?.backdropUrls || [],
            'random',
            buildArtworkSeed('fanart-backdrop'),
          );
          if (fanartBackdropUrl) {
            randomBackdropCandidates.push({
              imgUrlOverride: fanartBackdropUrl,
            });
          }
        }

        const imdbId = await input.resolveImdbId();
        if (imdbId) {
          randomBackdropCandidates.push({
            imgUrlOverride: buildCinemetaBackdropUrl(imdbId),
          });
        }

        const randomBackdropChoice = pickDeterministicItemBySeed(
          randomBackdropCandidates,
          buildArtworkSeed('backdrop-source'),
        );
        if (randomBackdropChoice) {
          return {
            imgPath: randomBackdropChoice.imgPath || '',
            imgUrlOverride: randomBackdropChoice.imgUrlOverride || null,
            logoAspectRatio: null,
            logoPath,
            posterIsTextless: false,
          };
        }
      }

      if (input.backdropArtworkSource === 'cinemeta') {
        const imdbId = await input.resolveImdbId();
        if (imdbId) {
          return {
            imgPath: '',
            imgUrlOverride: buildCinemetaBackdropUrl(imdbId),
            logoAspectRatio: null,
            logoPath,
            posterIsTextless: false,
          };
        }
      }

      if (input.backdropArtworkSource === 'fanart' && (input.mediaType === 'movie' || input.mediaType === 'tv')) {
        const fanartArtwork = await getFanartArtwork();
        const fanartBackdropUrl = pickFanartUrlByPreference(
          fanartArtwork?.backdropUrls || [],
          input.posterTextPreference,
          buildArtworkSeed('fanart-backdrop'),
        );
        if (fanartBackdropUrl) {
          return {
            imgPath: '',
            imgUrlOverride: fanartBackdropUrl,
            logoAspectRatio: null,
            logoPath,
            posterIsTextless: false,
          };
        }
      }

      const imdbId = await input.resolveImdbId();
      return {
        imgPath: selectedBackdrop?.file_path || '',
        imgUrlOverride: !selectedBackdrop?.file_path && imdbId ? buildCinemetaBackdropUrl(imdbId) : null,
        logoAspectRatio: null,
        logoPath,
        posterIsTextless: false,
      };
    }

    const resolveTmdbLogoAspectRatio = async (candidate?: TmdbImageAsset | null) => {
      const filePath = String(candidate?.file_path || '').trim();
      if (filePath) {
        const measuredAspectRatio = await input.getRemoteImageAspectRatio(
          buildTmdbImageUrl('logo', filePath, 500),
        );
        if (typeof measuredAspectRatio === 'number' && measuredAspectRatio > 0) {
          return measuredAspectRatio;
        }
      }

      return typeof candidate?.aspect_ratio === 'number' && candidate.aspect_ratio > 0
        ? candidate.aspect_ratio
        : null;
    };
    const tmdbLogoAspectRatio = await resolveTmdbLogoAspectRatio(
      (input.logoArtworkSource === 'random' ? randomLogoCandidate : selectedLogo) ||
        selectedLogo ||
        randomLogoCandidate,
    );

    if ((input.logoArtworkSource === 'fanart' || input.logoArtworkSource === 'random') && (input.mediaType === 'movie' || input.mediaType === 'tv')) {
      const fanartArtwork = await getFanartArtwork();
      const fanartLogoUrl = pickDeterministicItemBySeed(
        fanartArtwork?.logoUrls || [],
        buildArtworkSeed('fanart-logo'),
      );
      if (input.logoArtworkSource === 'fanart' && fanartLogoUrl) {
        const logoAspectRatio = await input.getRemoteImageAspectRatio(fanartLogoUrl);
        return {
          imgPath: '',
          imgUrlOverride: fanartLogoUrl,
          logoAspectRatio,
          logoPath: fanartLogoUrl,
          posterIsTextless: false,
        };
      }

      if (input.logoArtworkSource === 'random') {
        const randomLogoCandidates: Array<{
          imgPath: string;
          imgUrlOverride: string | null;
          logoAspectRatio: number | null;
          logoPath: string;
        }> = [];

        if (randomLogoPath) {
          randomLogoCandidates.push({
            imgPath: randomLogoPath,
            imgUrlOverride: null,
            logoAspectRatio: tmdbLogoAspectRatio,
            logoPath: randomLogoPath,
          });
        }

        if (fanartLogoUrl) {
          randomLogoCandidates.push({
            imgPath: '',
            imgUrlOverride: fanartLogoUrl,
            logoAspectRatio: await input.getRemoteImageAspectRatio(fanartLogoUrl),
            logoPath: fanartLogoUrl,
          });
        }

        const imdbId = await input.resolveImdbId();
        if (imdbId) {
          const cinemetaLogoUrl = buildCinemetaLogoUrl(imdbId);
          randomLogoCandidates.push({
            imgPath: '',
            imgUrlOverride: cinemetaLogoUrl,
            logoAspectRatio: await input.getRemoteImageAspectRatio(cinemetaLogoUrl),
            logoPath: cinemetaLogoUrl,
          });
        }

        const randomLogoChoice = pickDeterministicItemBySeed(
          randomLogoCandidates,
          buildArtworkSeed('logo-source'),
        );
        if (randomLogoChoice) {
          return {
            imgPath: randomLogoChoice.imgPath,
            imgUrlOverride: randomLogoChoice.imgUrlOverride,
            logoAspectRatio: randomLogoChoice.logoAspectRatio,
            logoPath: randomLogoChoice.logoPath,
            posterIsTextless: false,
          };
        }
      }
    }

    if (input.logoArtworkSource === 'cinemeta') {
      const imdbId = await input.resolveImdbId();
      if (imdbId) {
        const cinemetaLogoUrl = buildCinemetaLogoUrl(imdbId);
        return {
          imgPath: '',
          imgUrlOverride: cinemetaLogoUrl,
          logoAspectRatio: await input.getRemoteImageAspectRatio(cinemetaLogoUrl),
          logoPath: cinemetaLogoUrl,
          posterIsTextless: false,
        };
      }
    }

    const imdbId = await input.resolveImdbId();
    const cinemetaLogoUrl = imdbId ? buildCinemetaLogoUrl(imdbId) : null;
    return {
      imgPath: logoPath || '',
      imgUrlOverride: !logoPath && cinemetaLogoUrl ? cinemetaLogoUrl : null,
      logoAspectRatio:
        !logoPath && cinemetaLogoUrl
          ? (await input.getRemoteImageAspectRatio(cinemetaLogoUrl)) || tmdbLogoAspectRatio
          : tmdbLogoAspectRatio,
      logoPath: logoPath || cinemetaLogoUrl,
      posterIsTextless: false,
    };
  };
};
