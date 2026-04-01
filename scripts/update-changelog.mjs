import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeCommitForDisplay } from './commit-display-utils.mjs';

const pkgPath = path.resolve('package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const currentVersion = `v${pkg.version}`;
const today = new Date().toLocaleDateString('en-GB');
const RELEASE_TAG_RE = /^v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

const prettyFormat = '%H%x1f%s%x1f%b%x1e';

function isReleaseTag(tag) {
  return RELEASE_TAG_RE.test(String(tag || '').trim());
}

function isReleaseCommitSubject(subject) {
  return /^chore(?:\(release\))?:\s*(?:release|cut)\s+v?\d+\.\d+\.\d+\b/i.test(String(subject || '').trim());
}

function getVersionAnchor(version) {
  return String(version || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getCommits(range) {
  try {
    return execSync(`git log --first-parent ${range} --pretty=format:${prettyFormat}`, { encoding: 'utf8' })
      .split('\x1e')
      .map(entry => entry.trim())
      .filter(Boolean)
      .map(entry => {
        const [hash, subject, body] = entry.split('\x1f');
        return {
          hash: (hash || '').trim(),
          subject: (subject || '').trim(),
          body: body ? body.trim() : ''
        };
      });
  } catch (err) {
    return [];
  }
}

function formatEntries(entries) {
  const orderedEntries = [];
  const entryCounts = new Map();

  for (const entry of entries) {
    const normalizedEntry = String(entry || '').trim();
    if (!normalizedEntry) continue;
    if (!entryCounts.has(normalizedEntry)) {
      orderedEntries.push(normalizedEntry);
      entryCounts.set(normalizedEntry, 0);
    }
    entryCounts.set(normalizedEntry, (entryCounts.get(normalizedEntry) || 0) + 1);
  }

  return orderedEntries.map(entry => {
    const count = entryCounts.get(entry) || 1;
    const message =
      count > 1
        ? entry.includes('\n')
          ? `${entry.slice(0, entry.indexOf('\n'))} (${count} commits)${entry.slice(entry.indexOf('\n'))}`
          : `${entry} (${count} commits)`
        : entry;

    const m = message;
    if (m.includes('\n')) {
      const lines = m.split('\n');
      return `* ${lines[0]}\n${lines.slice(1).map(l => `  ${l}`).join('\n')}`;
    }
    return `* ${m}`;
  }).join('\n');
}

function generateSection(version, date, commits) {
  if (commits.length === 0) return '';

  const groups = {
    feat: [],
    fix: [],
    docs: [],
    refactor: [],
    perf: [],
    revert: [],
    chore: [],
    other: []
  };

  for (const commit of commits) {
    const { subject } = commit;
    
    if (isReleaseCommitSubject(subject)) {
      continue;
    }

    const normalized = normalizeCommitForDisplay(commit);
    const message = normalized.body ? `${normalized.title}\n\n${normalized.body}` : normalized.title;

    if (normalized.type === 'feat') groups.feat.push(message);
    else if (normalized.type === 'fix') groups.fix.push(message);
    else if (normalized.type === 'docs') groups.docs.push(message);
    else if (normalized.type === 'refactor') groups.refactor.push(message);
    else if (normalized.type === 'perf') groups.perf.push(message);
    else if (normalized.type === 'revert') groups.revert.push(message);
    else if (normalized.type === 'chore') groups.chore.push(message);
    else groups.other.push(message);
  }

  let section = `<a id="${getVersionAnchor(version)}"></a>\n\n## [${version}] - ${date}\n\n`;

  if (groups.feat.length) section += `### Added\n${formatEntries(groups.feat)}\n\n`;
  if (groups.fix.length) section += `### Fixed\n${formatEntries(groups.fix)}\n\n`;
  if (groups.docs.length) section += `### Documentation\n${formatEntries(groups.docs)}\n\n`;
  if (groups.perf.length) section += `### Performance\n${formatEntries(groups.perf)}\n\n`;
  if (groups.revert.length) section += `### Reverted\n${formatEntries(groups.revert)}\n\n`;

  const otherChanges = [...groups.other, ...groups.refactor, ...groups.chore];
  if (otherChanges.length) section += `### Other Changes\n${formatEntries(otherChanges)}\n\n`;

  return section;
}

function lastTag() {
  try {
    const tag = execSync('git describe --tags --abbrev=0 --first-parent --match "v[0-9]*"', { encoding: 'utf8' }).trim();
    return isReleaseTag(tag) ? tag : null;
  } catch {
    return null;
  }
}

function getAllTags() {
  try {
    return execSync('git tag --list "v[0-9]*" --sort=version:refname', { encoding: 'utf8' })
      .split('\n')
      .map(t => t.trim())
      .filter(isReleaseTag);
  } catch {
    return [];
  }
}

function getTagDate(tag) {
  try {
    const dateStr = execSync(`git log -1 --format=%ai ${tag}`, { encoding: 'utf8' }).trim();
    return new Date(dateStr).toLocaleDateString('en-GB');
  } catch {
    return today;
  }
}

const HEADER = `# Changelog

> [!NOTE]
> This changelog may contain duplicate entries for certain changes. This occurs when an upstream commit is followed by a corresponding conventional commit used for release management and repository standards.
`;

if (process.argv.includes('--rebuild')) {
  console.log('Rebuilding entire CHANGELOG.md...');
  const tags = getAllTags();
  let fullChangelog = HEADER + '\n';
  
  for (let i = tags.length - 1; i >= 0; i--) {
    const current = tags[i];
    const prev = i > 0 ? tags[i - 1] : null;
    const range = prev ? `${prev}..${current}` : current;
    const commits = getCommits(range);
    const date = getTagDate(current);
    fullChangelog += generateSection(current, date, commits);
  }

  fs.writeFileSync('CHANGELOG.md', fullChangelog);
  console.log('Rebuilt CHANGELOG.md successfully.');
} else {
  const prevTag = lastTag();
  const existingChangelog = fs.readFileSync('CHANGELOG.md', 'utf8');
  
  if (existingChangelog.includes(`## [${currentVersion}]`)) {
    console.log(`Changelog already contains entry for ${currentVersion}. skipping.`);
    process.exit(0);
  }

  const commits = getCommits(prevTag ? `${prevTag}..HEAD` : 'HEAD');
  if (commits.length === 0) {
    console.log('No new commits. Skipping.');
    process.exit(0);
  }

  const newEntry = generateSection(currentVersion, today, commits);
  
  const lines = existingChangelog.split('\n');
  const headerEndIndex = lines.findIndex(line => line.startsWith('## ['));
  const header = headerEndIndex === -1 ? HEADER + '\n' : lines.slice(0, headerEndIndex).join('\n') + '\n';
  const rest = headerEndIndex === -1 ? '' : lines.slice(headerEndIndex).join('\n');

  fs.writeFileSync('CHANGELOG.md', `${header}${newEntry}${rest}`);
  console.log(`Updated CHANGELOG.md with ${currentVersion} changes.`);
}
