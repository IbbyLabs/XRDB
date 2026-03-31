import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const README_PATH = path.join(ROOT_DIR, 'README.md');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');

const packageJson = JSON.parse(await fs.readFile(PACKAGE_JSON_PATH, 'utf8'));
const version = String(packageJson.version || '').trim();

if (!version) {
  throw new Error('package.json version is missing.');
}

const anchor = `v${version}`
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const readme = await fs.readFile(README_PATH, 'utf8');
const markerPattern =
  /(<!-- changelog-links:start -->\n)([\s\S]*?)(\n<!-- changelog-links:end -->)/;

if (!markerPattern.test(readme)) {
  throw new Error('README changelog link markers were not found.');
}

const updatedReadme = readme.replace(
  markerPattern,
  [
    '$1',
    '> [!TIP]',
    `> **Changelog:** read the [full changelog](CHANGELOG.md) or jump straight to the [latest entry](CHANGELOG.md#${anchor}).`,
    '$3',
  ].join('\n'),
);

if (updatedReadme !== readme) {
  await fs.writeFile(README_PATH, updatedReadme);
}

console.log(`Updated README changelog link for version ${version}.`);
