import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { normalizeCommitForDisplay } from './commit-display-utils.mjs';

const COMMIT_LIMIT = 120;
const PUBLIC_COMMIT_TYPES = new Set(['feat', 'fix', 'perf', 'build', 'revert']);
const INTERNAL_TITLE_PATTERNS = [
  /\bcheckpoint\b/i,
  /\bcleanup\b/i,
  /\bfork\b/i,
  /\binheritance\b/i,
  /\broadmap\b/i,
  /\brefactor\b/i,
  /\brewrite\b/i,
  /\btransition\b/i,
  /\bupstream\b/i,
  /\btmp\b/i,
];
const prettyFormat = '%H%x1f%h%x1f%an%x1f%ae%x1f%cI%x1f%s%x1f%b%x1e';
const output = execSync(`git log --first-parent -n ${COMMIT_LIMIT} --date=iso-strict --pretty=format:${prettyFormat}`, {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

function isPublicCommitEntry(entry) {
  if (!entry?.title) {
    return false;
  }

  if (INTERNAL_TITLE_PATTERNS.some((pattern) => pattern.test(entry.title))) {
    return false;
  }

  if (entry.type === 'chore') {
    return /^release\b/i.test(entry.title);
  }

  return PUBLIC_COMMIT_TYPES.has(entry.type);
}

const commitRecords = output
  .split('\x1e')
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const [hash, shortHash, authorName, authorEmail, date, subject, body] = entry.split('\x1f');
    const normalized = normalizeCommitForDisplay({
      hash,
      subject,
      body,
    });

    const isImported = authorName !== 'IbbyLabs' && !authorEmail.includes('IbbyLabs');

    return {
      hash: String(hash || '').trim(),
      shortHash: String(shortHash || '').trim(),
      author: {
        name: authorName,
        email: authorEmail,
      },
      isImported,
      date: String(date || '').trim(),
      type: normalized.type,
      title: normalized.title,
      body: null,
    };
  })
  .filter((entry) => isPublicCommitEntry(entry))
  .filter((entry) => entry.hash && entry.shortHash && entry.date && entry.title);

const payload = {
  generatedAt: new Date().toISOString(),
  total: commitRecords.length,
  commits: commitRecords,
};

const outputPath = resolve(process.cwd(), 'public', 'commits.json');
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`Wrote ${commitRecords.length} commits to ${outputPath}`);
