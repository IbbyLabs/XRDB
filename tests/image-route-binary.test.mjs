import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bufferToArrayBuffer,
  chunkBy,
  decodeDataUriBuffer,
  isLightNeutralPixel,
  shouldUseNeutralGlassPlateForIcon,
} from '../lib/imageRouteBinary.ts';

test('image route binary converts node buffers into exact array buffers', () => {
  const source = Buffer.from([1, 2, 3, 4]);
  const converted = bufferToArrayBuffer(source);

  assert.deepEqual(Array.from(new Uint8Array(converted)), [1, 2, 3, 4]);
});

test('image route binary decodes base64 and utf8 data uris', () => {
  assert.equal(
    decodeDataUriBuffer('data:text/plain;base64,SGVsbG8=')?.toString('utf8'),
    'Hello',
  );
  assert.equal(
    decodeDataUriBuffer('data:text/plain,Hello%20World')?.toString('utf8'),
    'Hello World',
  );
  assert.equal(decodeDataUriBuffer('plain text'), null);
});

test('image route binary detects light neutral pixels conservatively', () => {
  assert.equal(isLightNeutralPixel(240, 238, 236, 255), true);
  assert.equal(isLightNeutralPixel(240, 180, 100, 255), false);
  assert.equal(isLightNeutralPixel(240, 238, 236, 100), false);
});

test('image route binary avoids sharp work for invalid icon inputs and chunks arrays safely', async () => {
  let called = false;
  const getSharpFactory = async () => {
    called = true;
    throw new Error('should not run');
  };

  assert.equal(await shouldUseNeutralGlassPlateForIcon('plain text', getSharpFactory), false);
  assert.equal(called, false);
  assert.deepEqual(chunkBy([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});
