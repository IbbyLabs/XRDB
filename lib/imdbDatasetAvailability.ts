import { ensureDbInitialized, getDb, getDbPath } from './sqliteStore.ts';

type TableAvailability = {
  dbPath: string;
  checkedAt: number;
  hasRatings: boolean;
  hasEpisodes: boolean;
};

const TABLE_CHECK_TTL_MS = 60 * 1000;

let tableAvailability: TableAvailability = {
  dbPath: '',
  checkedAt: 0,
  hasRatings: false,
  hasEpisodes: false,
};

const tableHasRows = (tableName: string) => {
  const db = getDb();
  try {
    return Boolean(db.prepare(`SELECT 1 FROM ${tableName} LIMIT 1`).get());
  } catch {
    return false;
  }
};

export const refreshImdbDatasetTableAvailability = () => {
  const now = Date.now();
  const dbPath = getDbPath();

  if (tableAvailability.dbPath === dbPath && now - tableAvailability.checkedAt < TABLE_CHECK_TTL_MS) {
    return tableAvailability;
  }

  ensureDbInitialized();

  tableAvailability = {
    dbPath,
    checkedAt: now,
    hasRatings: tableHasRows('imdb_ratings'),
    hasEpisodes: tableHasRows('imdb_episodes'),
  };

  return tableAvailability;
};
