import { TMDB_CACHE_TTL_MS } from './imageRouteConfig.ts';
import type { CachedJsonResponse, CachedTextResponse, PhaseDurations } from './imageRouteRuntime.ts';
import { measurePhase } from './imageRouteRuntime.ts';
import { TMDB_API_BASE_URL } from './serviceBaseUrls.ts';

type EpisodeLookupJsonFetch = (
  key: string,
  url: string,
  ttlMs: number,
  phases: PhaseDurations,
  phase: keyof PhaseDurations,
  init?: RequestInit,
) => Promise<CachedJsonResponse>;

type EpisodeLookupTextFetch = (
  key: string,
  url: string,
  ttlMs: number,
  phases: PhaseDurations,
  phase: keyof PhaseDurations,
  init?: RequestInit,
) => Promise<CachedTextResponse>;

export const extractTvdbEpisodeIdFromAiredOrderHtml = (
  html: string,
  seriesPageUrl: string,
  season: string,
  episode: string,
) => {
  const seasonNumber = Number.parseInt(season, 10);
  const episodeNumber = Number.parseInt(episode, 10);
  if (!Number.isFinite(seasonNumber) || !Number.isFinite(episodeNumber)) return null;

  const escapedSeriesSlug = seriesPageUrl
    .replace(/^https?:\/\/thetvdb\.com/i, '')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const episodeCode = `S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`;
  const matcher = new RegExp(
    `${episodeCode}[\\s\\S]{0,1200}?href="${escapedSeriesSlug}/episodes/(\\d+)"`,
    'i',
  );
  return html.match(matcher)?.[1] || null;
};

export const resolveTvdbEpisodeToTmdb = async (
  seriesId: string,
  season: string,
  episode: string,
  tmdbKey: string,
  phases: PhaseDurations,
  fetchJsonCached: EpisodeLookupJsonFetch,
  fetchTextCached: EpisodeLookupTextFetch,
  fetchImpl: typeof fetch = fetch,
) => {
  const seriesUrl = `https://thetvdb.com/dereferrer/series/${encodeURIComponent(seriesId)}`;
  const seriesPageUrl = await measurePhase(phases, 'tmdb', async () => {
    const response = await fetchImpl(seriesUrl, { cache: 'no-store', redirect: 'follow' });
    return response.ok ? response.url : null;
  }).catch(() => null);
  if (!seriesPageUrl) return null;

  const airedOrderUrl = `${seriesPageUrl.replace(/\/+$/, '')}/allseasons/official`;
  const airedOrderResponse = await fetchTextCached(
    `tvdb:series:${seriesId}:aired-order`,
    airedOrderUrl,
    TMDB_CACHE_TTL_MS,
    phases,
    'tmdb',
  );
  if (!airedOrderResponse.ok || !airedOrderResponse.data) return null;

  const tvdbEpisodeId = extractTvdbEpisodeIdFromAiredOrderHtml(
    airedOrderResponse.data,
    seriesPageUrl,
    season,
    episode,
  );
  if (!tvdbEpisodeId) return null;

  const findResponse = await fetchJsonCached(
    `tmdb:find:tvdb-episode:${tvdbEpisodeId}`,
    `${TMDB_API_BASE_URL}/find/${tvdbEpisodeId}?api_key=${tmdbKey}&external_source=tvdb_id`,
    TMDB_CACHE_TTL_MS,
    phases,
    'tmdb',
  );
  const episodeResult = Array.isArray(findResponse.data?.tv_episode_results)
    ? findResponse.data.tv_episode_results[0]
    : null;
  const showId = Number(episodeResult?.show_id);
  const seasonNumber = Number(episodeResult?.season_number);
  const episodeNumber = Number(episodeResult?.episode_number);
  if (!Number.isFinite(showId)) return null;

  return {
    showId: String(showId),
    season: Number.isFinite(seasonNumber) ? String(seasonNumber) : null,
    episode: Number.isFinite(episodeNumber) ? String(episodeNumber) : null,
  };
};

export const resolveTmdbConsolidatedSeasonEpisode = async (
  tmdbShowId: string,
  requestedSeason: string,
  requestedEpisode: string,
  tmdbKey: string,
  phases: PhaseDurations,
  fetchJsonCached: EpisodeLookupJsonFetch,
): Promise<{ season: string; episode: string } | null> => {
  const targetSeason = Number.parseInt(requestedSeason, 10);
  const targetEpisode = Number.parseInt(requestedEpisode, 10);
  if (
    !Number.isFinite(targetSeason) ||
    !Number.isFinite(targetEpisode) ||
    targetSeason < 1 ||
    targetEpisode < 1
  ) {
    return null;
  }

  const targetSeasonResponse = await fetchJsonCached(
    `tmdb:tv:${tmdbShowId}:season:${targetSeason}`,
    `${TMDB_API_BASE_URL}/tv/${tmdbShowId}/season/${targetSeason}?api_key=${tmdbKey}`,
    TMDB_CACHE_TTL_MS,
    phases,
    'tmdb',
  );
  if (!targetSeasonResponse.ok || !Array.isArray(targetSeasonResponse.data?.episodes)) {
    return null;
  }
  if (targetEpisode <= (targetSeasonResponse.data.episodes as unknown[]).length) {
    return null;
  }

  let priorCount = 0;
  for (let s = 1; s < targetSeason; s += 1) {
    const resp = await fetchJsonCached(
      `tmdb:tv:${tmdbShowId}:season:${s}`,
      `${TMDB_API_BASE_URL}/tv/${tmdbShowId}/season/${s}?api_key=${tmdbKey}`,
      TMDB_CACHE_TTL_MS,
      phases,
      'tmdb',
    );
    if (!resp.ok || !Array.isArray(resp.data?.episodes)) return null;
    priorCount += (resp.data.episodes as unknown[]).length;
  }
  const absoluteIndex = priorCount + targetEpisode;

  let runningCount = 0;
  for (let s = 1; s <= 30; s += 1) {
    const resp = await fetchJsonCached(
      `tmdb:tv:${tmdbShowId}:season:${s}`,
      `${TMDB_API_BASE_URL}/tv/${tmdbShowId}/season/${s}?api_key=${tmdbKey}`,
      TMDB_CACHE_TTL_MS,
      phases,
      'tmdb',
    );
    if (!resp.ok || !Array.isArray(resp.data?.episodes) || resp.data.episodes.length === 0) break;
    const episodes = resp.data.episodes as Array<{ episode_number?: unknown }>;
    if (absoluteIndex <= runningCount + episodes.length) {
      const indexInSeason = absoluteIndex - runningCount;
      const sorted = [...episodes].sort(
        (a, b) => Number(a.episode_number) - Number(b.episode_number),
      );
      const ep = sorted[indexInSeason - 1];
      if (ep == null) return null;
      const epNum = Number(ep.episode_number);
      if (!Number.isFinite(epNum)) return null;
      return { season: String(s), episode: String(epNum) };
    }
    runningCount += episodes.length;
  }
  return null;
};

export const resolveTmdbEpisodeByAirYear = async (
  tmdbShowId: string,
  requestedSeason: string,
  requestedEpisode: string,
  tmdbKey: string,
  phases: PhaseDurations,
  fetchJsonCached: EpisodeLookupJsonFetch,
) => {
  const bucketSeason = Number.parseInt(requestedSeason, 10);
  const bucketEpisode = Number.parseInt(requestedEpisode, 10);
  if (!Number.isFinite(bucketSeason) || !Number.isFinite(bucketEpisode) || bucketSeason < 1 || bucketEpisode < 1) {
    return null;
  }

  const showResponse = await fetchJsonCached(
    `tmdb:tv:${tmdbShowId}`,
    `${TMDB_API_BASE_URL}/tv/${tmdbShowId}?api_key=${tmdbKey}`,
    TMDB_CACHE_TTL_MS,
    phases,
    'tmdb',
  );
  if (!showResponse.ok) return null;

  const numberOfSeasons = Number(showResponse.data?.number_of_seasons);
  if (!Number.isFinite(numberOfSeasons) || numberOfSeasons < 1) return null;

  const yearBuckets = new Map<number, Array<{ tmdbSeason: number; tmdbEpisode: number }>>();
  for (let seasonIndex = 1; seasonIndex <= numberOfSeasons; seasonIndex += 1) {
    const seasonResponse = await fetchJsonCached(
      `tmdb:tv:${tmdbShowId}:season:${seasonIndex}`,
      `${TMDB_API_BASE_URL}/tv/${tmdbShowId}/season/${seasonIndex}?api_key=${tmdbKey}`,
      TMDB_CACHE_TTL_MS,
      phases,
      'tmdb',
    );
    if (!seasonResponse.ok || !Array.isArray(seasonResponse.data?.episodes)) continue;

    for (const episodeData of seasonResponse.data.episodes) {
      const airDate = typeof episodeData?.air_date === 'string' ? episodeData.air_date : '';
      const year = Number.parseInt(airDate.slice(0, 4), 10);
      const tmdbEpisode = Number(episodeData?.episode_number);
      if (!Number.isFinite(year) || !Number.isFinite(tmdbEpisode)) continue;
      const bucket = yearBuckets.get(year) || [];
      bucket.push({ tmdbSeason: seasonIndex, tmdbEpisode });
      yearBuckets.set(year, bucket);
    }
  }

  const orderedYears = [...yearBuckets.keys()].sort((left, right) => left - right);
  const targetYear = orderedYears[bucketSeason - 1];
  if (!Number.isFinite(targetYear)) return null;
  const bucketEpisodes = yearBuckets.get(targetYear) || [];
  const targetEpisode = bucketEpisodes[bucketEpisode - 1];
  if (!targetEpisode) return null;

  return {
    showId: tmdbShowId,
    season: String(targetEpisode.tmdbSeason),
    episode: String(targetEpisode.tmdbEpisode),
  };
};
