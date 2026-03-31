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

const tableExists = (tableName: string) => {
  const db = getDb();
  return Boolean(
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName),
  );
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
    hasRatings: tableExists('imdb_ratings'),
    hasEpisodes: tableExists('imdb_episodes'),
  };

  return tableAvailability;
};
