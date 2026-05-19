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
const tipText = `> **Changelog:** read the [full changelog](CHANGELOG.md) or jump straight to the [latest entry](CHANGELOG.md#${anchor}).`;
const changelogLine = `- [Changelog](CHANGELOG.md) (latest: [v${version}](CHANGELOG.md#${anchor}))`;

let updatedReadme = readme;

if (markerPattern.test(updatedReadme)) {
  updatedReadme = updatedReadme.replace(
    markerPattern,
    [
      '$1',
      '> [!TIP]',
      tipText,
      '$3',
    ].join('\n'),
  );
} else {
  const changelogLinePattern = /^- \[Changelog\]\(CHANGELOG\.md\)(?:\s*\(latest:\s*\[v[^\]]+\]\(CHANGELOG\.md#[^)]+\)\))?\s*$/m;
  if (changelogLinePattern.test(updatedReadme)) {
    updatedReadme = updatedReadme.replace(changelogLinePattern, changelogLine);
  } else {
    const docsLinksPattern = /(## Docs Links\n\n)([\s\S]*?)(\n## )/;
    if (!docsLinksPattern.test(updatedReadme)) {
      throw new Error('Unable to update changelog link: neither changelog markers nor a Docs Links section were found in README.md.');
    }
    updatedReadme = updatedReadme.replace(
      docsLinksPattern,
      (_, prefix, body, suffix) => {
        const trimmedBody = body.replace(/\n+$/u, '');
        const nextBody = `${trimmedBody}\n${changelogLine}\n`;
        return `${prefix}${nextBody}${suffix}`;
      },
    );
  }
}

if (updatedReadme !== readme) {
  await fs.writeFile(README_PATH, updatedReadme);
}

console.log(`Updated README changelog link for version ${version}.`);
