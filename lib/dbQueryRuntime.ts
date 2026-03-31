import type Database from 'better-sqlite3';

export const normalizeQueryText = (text: string) => text.replace(/\$(\d+)/g, '?');

const isSelectQuery = (text: string) => /^\s*select\b/i.test(text);

export const executeQuery = <T = any>(db: Database.Database, text: string, values: any[] = []) => {
  const stmt = db.prepare(normalizeQueryText(text));

  if (isSelectQuery(text)) {
    return { rows: stmt.all(...values) as T[] };
  }

  const info = stmt.run(...values);
  return { rows: [] as T[], info };
};
