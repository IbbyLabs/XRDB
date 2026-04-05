import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildPublicCommitRecords } from './public-commit-records.mjs';

const commitRecords = buildPublicCommitRecords();

const payload = {
  generatedAt: new Date().toISOString(),
  total: commitRecords.length,
  commits: commitRecords,
};

const outputPath = resolve(process.cwd(), 'public', 'commits.json');
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`Wrote ${commitRecords.length} commits to ${outputPath}`);
