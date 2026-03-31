import { ensureDbInitialized, getDb, getDbPath } from './dbCore.ts';
import { executeQuery } from './dbQueryRuntime.ts';

export { ensureDbInitialized, getDb, getDbPath } from './dbCore.ts';

export const dbQuery = async <T = any>(text: string, values: any[] = []) => {
  ensureDbInitialized();
  return executeQuery<T>(getDb(), text, values);
};

export type DbTransactionClient = {
  query: <T = any>(text: string, values?: any[]) => Promise<{ rows: T[] }>;
};

export const dbTransaction = async <T>(handler: (client: DbTransactionClient) => Promise<T>) => {
  ensureDbInitialized();
  const db = getDb();

  const client: DbTransactionClient = {
    query: async (text, values = []) => executeQuery(db, text, values),
  };

  db.exec('BEGIN');
  try {
    const result = await handler(client);
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
    }
    throw error;
  }
};
