import test from 'node:test';
import assert from 'node:assert/strict';

import { incrementFinalImageRendererCacheVersion } from '../scripts/bump-final-render-cache-version.mjs';

test('incrementFinalImageRendererCacheVersion increments the numeric cache suffix', () => {
  const source = "export const FINAL_IMAGE_RENDERER_CACHE_VERSION = 'poster-backdrop-logo-v78';\n";
  const result = incrementFinalImageRendererCacheVersion(source);

  assert.equal(result.currentVersion, 78);
  assert.equal(result.nextVersion, 79);
  assert.match(
    result.updatedSource,
    /FINAL_IMAGE_RENDERER_CACHE_VERSION = 'poster-backdrop-logo-v79'/,
  );
});

test('incrementFinalImageRendererCacheVersion throws when the cache version is missing', () => {
  assert.throws(
    () => incrementFinalImageRendererCacheVersion("export const nope = 'poster-backdrop-logo-v78';\n"),
    /Could not find FINAL_IMAGE_RENDERER_CACHE_VERSION/,
  );
});
