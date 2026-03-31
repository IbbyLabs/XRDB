import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [, , rawVersion, outputPath] = process.argv;

if (!rawVersion) {
  console.error('Usage: node scripts/generate-github-release-notes.mjs <tag|version> [outputPath]');
  process.exit(1);
}

const ROOT_DIR = process.cwd();
const CHANGELOG_PATH = path.join(ROOT_DIR, 'CHANGELOG.md');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');
const CHANGELOG = fs.readFileSync(CHANGELOG_PATH, 'utf8');
const PACKAGE_JSON = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
const TAG = String(rawVersion).startsWith('v') ? String(rawVersion).trim() : `v${String(rawVersion).trim()}`;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getVersionAnchor(version) {
  return String(version || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getRepositoryWebUrl() {
  const repositoryUrl = String(PACKAGE_JSON?.repository?.url || '').trim();
  if (repositoryUrl) {
    return repositoryUrl
      .replace(/^git\+/, '')
      .replace(/\.git$/i, '')
      .replace(/^git@github\.com:/i, 'https://github.com/');
  }

  try {
    const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8' }).trim();
    return remoteUrl
      .replace(/\.git$/i, '')
      .replace(/^git@github\.com:/i, 'https://github.com/');
  } catch {
    throw new Error('Unable to determine repository URL.');
  }
}

function hasTag(tag) {
  try {
    execSync(`git rev-parse --verify --quiet refs/tags/${tag}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getPreviousReleaseTag(tag) {
  const tags = execSync('git tag --list "v[0-9]*" --sort=version:refname', { encoding: 'utf8' })
    .split('\n')
    .map(entry => entry.trim())
    .filter(Boolean);
  const currentIndex = tags.indexOf(tag);
  if (currentIndex <= 0) return null;
  return tags[currentIndex - 1];
}

function getChangelogSection(version) {
  const headingRe = new RegExp(`^## \\[${escapeRegExp(version)}\\] - .*$`, 'm');
  const headingMatch = CHANGELOG.match(headingRe);
  if (!headingMatch || headingMatch.index == null) {
    throw new Error(`Could not find changelog section for ${version}.`);
  }

  const headingStart = headingMatch.index;
  const bodyStart = headingStart + headingMatch[0].length;
  const remaining = CHANGELOG.slice(bodyStart);
  const nextSectionMatch = remaining.match(/\n<a id="[^"]+"><\/a>\n\n## \[|\n## \[/);
  const section = (nextSectionMatch && nextSectionMatch.index != null
    ? remaining.slice(0, nextSectionMatch.index)
    : remaining).trim();

  if (!section) {
    throw new Error(`Changelog section for ${version} is empty.`);
  }

  return section;
}

const repositoryUrl = getRepositoryWebUrl();
const changelogRef = hasTag(TAG) ? TAG : 'main';
const changelogUrl = `${repositoryUrl}/blob/${changelogRef}/CHANGELOG.md#${getVersionAnchor(TAG)}`;
const previousTag = getPreviousReleaseTag(TAG);
const compareUrl = previousTag ? `${repositoryUrl}/compare/${previousTag}...${TAG}` : null;
const sectionBody = getChangelogSection(TAG);

const changelogLine = compareUrl
  ? `> **Changelog:** read the [matching entry](${changelogUrl}) or browse the [full compare](${compareUrl}).`
  : `> **Changelog:** read the [matching entry](${changelogUrl}).`;

const lines = [
  '> [!TIP]',
  changelogLine,
];

lines.push('');
lines.push(sectionBody);
lines.push('');

const output = `${lines.join('\n')}\n`;

if (outputPath) {
  fs.writeFileSync(path.resolve(ROOT_DIR, outputPath), output, 'utf8');
} else {
  process.stdout.write(output);
}
