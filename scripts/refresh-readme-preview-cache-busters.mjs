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

const normalizedVersion = version.replace(/[^0-9A-Za-z]+/g, '-');
const previewUrlPattern =
  /(https:\/\/xrdb\.ibbylabs\.dev\/preview\/([^"?\s]+)\?cb=)([^"\s<]+)/g;

const readme = await fs.readFile(README_PATH, 'utf8');

let replacementCount = 0;
const updatedReadme = readme.replace(previewUrlPattern, (_match, prefix, slug) => {
  replacementCount += 1;
  return `${prefix}readme-preview-${slug}-v${normalizedVersion}`;
});

if (replacementCount === 0) {
  throw new Error('No README preview URLs with cb tokens were found.');
}

if (updatedReadme !== readme) {
  await fs.writeFile(README_PATH, updatedReadme);
}

console.log(
  `Updated ${replacementCount} README preview cache buster tokens for version ${version}.`,
);
