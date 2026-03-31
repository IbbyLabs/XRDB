import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

const importFresh = async (relativePath) => {
  const url = new URL(relativePath, import.meta.url);
  url.searchParams.set('t', `${Date.now()}-${Math.random()}`);
  return import(url.href);
};

test('db query runtime normalizes positional placeholders and returns rows for select queries', async () => {
  const queryModule = await importFresh('../lib/dbQueryRuntime.ts');
  const db = new Database(':memory:');

  db.exec('CREATE TABLE sample (id INTEGER PRIMARY KEY, label TEXT NOT NULL)');

  const insertResult = queryModule.executeQuery(db, 'INSERT INTO sample (label) VALUES ($1)', ['alpha']);
  const selectResult = queryModule.executeQuery(db, 'SELECT label FROM sample WHERE id = $1', [1]);

  assert.equal(insertResult.rows.length, 0);
  assert.equal(queryModule.normalizeQueryText('SELECT * FROM sample WHERE id = $1 AND label = $2'), 'SELECT * FROM sample WHERE id = ? AND label = ?');
  assert.deepEqual(selectResult.rows, [{ label: 'alpha' }]);

  db.close();
});
