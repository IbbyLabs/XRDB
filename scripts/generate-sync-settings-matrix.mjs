import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYNCABLE_TARGET_KEY_MAP, SYNCABLE_GLOBAL_KEYS, SYNC_SPECIAL_RULES } from '../lib/crossTypeSync.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outputPath = path.join(rootDir, 'docs', 'sync-settings-matrix.md');

const targetKeyMap = SYNCABLE_TARGET_KEY_MAP;
const globalKeys = SYNCABLE_GLOBAL_KEYS;
const specialRules = SYNC_SPECIAL_RULES;

const toTypeKey = (type, keySuffix, isGlobal) => {
  if (isGlobal) {
    return keySuffix;
  }
  return `${type}${keySuffix}`;
};

const rows = Object.entries(targetKeyMap)
  .map(([field, keySuffix]) => {
    const isGlobal = globalKeys.has(field);
    return {
      field,
      poster: toTypeKey('poster', keySuffix, isGlobal),
      backdrop: toTypeKey('backdrop', keySuffix, isGlobal),
      thumbnail: toTypeKey('thumbnail', keySuffix, isGlobal),
      logo: field === 'streamBadges' ? '-' : toTypeKey('logo', keySuffix, isGlobal),
    };
  })
  .sort((a, b) => a.field.localeCompare(b.field));

const header = [
  '# Sync Settings Matrix',
  '',
  'This file is auto-generated from `lib/crossTypeSync.ts` by `scripts/generate-sync-settings-matrix.mjs`.',
  '',
  'Any setting not listed in this table is not synchronized by Sync to all, Sync to [type], or Pull from [type].',
  '',
  '## Matrix',
  '',
  '| Field | Poster key | Backdrop key | Thumbnail key | Logo key |',
  '| --- | --- | --- | --- | --- |',
];

const tableLines = rows.map(
  (row) => `| ${row.field} | ${row.poster} | ${row.backdrop} | ${row.thumbnail} | ${row.logo} |`,
);

const rulesBlock = [
  '',
  '## Special Rules',
  '',
  ...specialRules.map((rule) => `- ${rule}`),
  '',
];

const content = [...header, ...tableLines, ...rulesBlock].join('\n');

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, content, 'utf8');
console.log(`Wrote ${path.relative(rootDir, outputPath)}`);
