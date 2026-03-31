import { ensureDbInitialized, getDb } from './sqliteStore.ts';
import { refreshImdbDatasetTableAvailability } from './imdbDatasetAvailability.ts';
import {
  normalizeImdbId,
  toImdbDatasetEpisode,
  toImdbDatasetRating,
  type ImdbDatasetEpisode,
  type ImdbDatasetRating,
} from './imdbDatasetRows.ts';

export type { ImdbDatasetEpisode, ImdbDatasetRating } from './imdbDatasetRows.ts';

export const getImdbRatingFromDataset = (imdbId: string): ImdbDatasetRating | null => {
  const normalized = normalizeImdbId(imdbId);
  if (!normalized) return null;

  if (!refreshImdbDatasetTableAvailability().hasRatings) return null;

  ensureDbInitialized();
  const db = getDb();
  try {
    return toImdbDatasetRating(
      db
      .prepare('SELECT average_rating as averageRating, num_votes as numVotes FROM imdb_ratings WHERE tconst = ?')
      .get(normalized) as { averageRating?: number; numVotes?: number } | undefined
    );
  } catch {
    return null;
  }
};

export const getImdbEpisodeFromDataset = (imdbId: string): ImdbDatasetEpisode | null => {
  const normalized = normalizeImdbId(imdbId);
  if (!normalized) return null;

  if (!refreshImdbDatasetTableAvailability().hasEpisodes) return null;

  ensureDbInitialized();
  const db = getDb();
  try {
    return toImdbDatasetEpisode(
      db
      .prepare(
        `SELECT tconst, parent_tconst as parentTconst, season_number as seasonNumber, episode_number as episodeNumber
         FROM imdb_episodes
         WHERE tconst = ?`
      )
      .get(normalized) as
      | { tconst?: string; parentTconst?: string; seasonNumber?: number | null; episodeNumber?: number | null }
      | undefined
    );
  } catch {
    return null;
  }
};

export const findImdbEpisodeBySeriesSeasonEpisode = (
  seriesImdbId: string,
  seasonNumber: number,
  episodeNumber: number,
): ImdbDatasetEpisode | null => {
  const normalizedSeriesId = normalizeImdbId(seriesImdbId);
  if (!normalizedSeriesId) return null;
  if (!Number.isFinite(seasonNumber) || !Number.isFinite(episodeNumber)) return null;

  if (!refreshImdbDatasetTableAvailability().hasEpisodes) return null;

  ensureDbInitialized();
  const db = getDb();
  try {
    return toImdbDatasetEpisode(
      db
      .prepare(
        `SELECT tconst, parent_tconst as parentTconst, season_number as seasonNumber, episode_number as episodeNumber
         FROM imdb_episodes
         WHERE parent_tconst = ? AND season_number = ? AND episode_number = ?
         LIMIT 1`
      )
      .get(normalizedSeriesId, seasonNumber, episodeNumber) as
      | { tconst?: string; parentTconst?: string; seasonNumber?: number | null; episodeNumber?: number | null }
      | undefined
    );
  } catch {
    return null;
  }
};
