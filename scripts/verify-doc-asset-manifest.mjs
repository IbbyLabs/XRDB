import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GENERATED_DOC_STATIC_ASSET_PATHS } from './doc-static-asset-manifest.mjs';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));
const README_PATH = path.join(ROOT_DIR, 'README.md');

const uniqueSorted = (values) => [...new Set(values)].sort((left, right) => left.localeCompare(right));

const readme = await fs.readFile(README_PATH, 'utf8');
const referencedDocImages = uniqueSorted(readme.match(/docs\/images\/[A-Za-z0-9._/-]+/g) || []);
const generatedDocImages = uniqueSorted(GENERATED_DOC_STATIC_ASSET_PATHS);

if (JSON.stringify(referencedDocImages) !== JSON.stringify(generatedDocImages)) {
  console.error('README doc image references do not match the generated asset manifest.');
  console.error(`README references (${referencedDocImages.length}):`);
  for (const assetPath of referencedDocImages) {
    console.error(`  ${assetPath}`);
  }
  console.error(`Generated assets (${generatedDocImages.length}):`);
  for (const assetPath of generatedDocImages) {
    console.error(`  ${assetPath}`);
  }
  process.exit(1);
}

for (const assetPath of generatedDocImages) {
  await fs.access(path.join(ROOT_DIR, assetPath));
}

console.log(`Verified ${generatedDocImages.length} README doc image references against the generated asset manifest.`);
