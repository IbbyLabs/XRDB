export type ImdbDatasetRating = {
  rating: number;
  votes: number;
};

export type ImdbDatasetEpisode = {
  imdbId: string;
  seriesImdbId: string;
  seasonNumber: number | null;
  episodeNumber: number | null;
};

type ImdbDatasetRatingRow = {
  averageRating?: number;
  numVotes?: number;
};

type ImdbDatasetEpisodeRow = {
  tconst?: string;
  parentTconst?: string;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
};

export const normalizeImdbId = (value?: string | null) => {
  const normalized = String(value ?? '').trim();
  return /^tt\d+$/.test(normalized) ? normalized : null;
};

export const toImdbDatasetRating = (row?: ImdbDatasetRatingRow): ImdbDatasetRating | null => {
  if (!row) return null;
  const rating = Number(row.averageRating);
  const votes = Number(row.numVotes);
  if (!Number.isFinite(rating) || !Number.isFinite(votes)) return null;
  return { rating, votes };
};

export const toImdbDatasetEpisode = (row?: ImdbDatasetEpisodeRow): ImdbDatasetEpisode | null => {
  if (!row?.tconst || !row.parentTconst) return null;

  return {
    imdbId: row.tconst,
    seriesImdbId: row.parentTconst,
    seasonNumber:
      typeof row.seasonNumber === 'number' && Number.isFinite(row.seasonNumber)
        ? row.seasonNumber
        : null,
    episodeNumber:
      typeof row.episodeNumber === 'number' && Number.isFinite(row.episodeNumber)
        ? row.episodeNumber
        : null,
  };
};
