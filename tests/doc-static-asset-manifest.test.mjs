import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { GENERATED_DOC_STATIC_ASSET_PATHS } from '../scripts/doc-static-asset-manifest.mjs';

const uniqueSorted = (values) => [...new Set(values)].sort((left, right) => left.localeCompare(right));

test('README doc image references match the generated asset manifest', async () => {
  const readme = await fs.readFile(new URL('../README.md', import.meta.url), 'utf8');
  const referencedDocImages = uniqueSorted(readme.match(/docs\/images\/[A-Za-z0-9._/-]+/g) || []);
  const generatedDocImages = uniqueSorted(GENERATED_DOC_STATIC_ASSET_PATHS);

  assert.deepEqual(referencedDocImages, generatedDocImages);
});
