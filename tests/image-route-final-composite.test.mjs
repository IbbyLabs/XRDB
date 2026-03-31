import test from 'node:test';
import assert from 'node:assert/strict';

import sharp from 'sharp';

import {
  renderFinalCompositeImage,
  resolveFinalCompositeBackground,
} from '../lib/imageRouteFinalComposite.ts';

const createOverlay = async ({ width, height, rgba }) =>
  sharp({
    create: {
      width,
      height,
      channels: 4,
      background: rgba,
    },
  })
    .png()
    .toBuffer();

test('image route final composite resolves expected background colors', () => {
  assert.deepEqual(
    resolveFinalCompositeBackground({ imageType: 'logo', logoBackground: 'dark' }),
    { r: 17, g: 24, b: 39, alpha: 1 }
  );
  assert.deepEqual(
    resolveFinalCompositeBackground({ imageType: 'logo', logoBackground: 'transparent' }),
    { r: 0, g: 0, b: 0, alpha: 0 }
  );
  assert.deepEqual(
    resolveFinalCompositeBackground({ imageType: 'poster', logoBackground: 'transparent' }),
    { r: 17, g: 17, b: 17, alpha: 1 }
  );
});

test('image route final composite renders transparent logo canvases as png', async () => {
  const overlay = await createOverlay({
    width: 10,
    height: 10,
    rgba: { r: 255, g: 255, b: 255, alpha: 1 },
  });
  const rendered = await renderFinalCompositeImage({
    sharpFactory: sharp,
    overlays: [{ input: overlay, left: 5, top: 5 }],
    outputWidth: 30,
    finalOutputHeight: 20,
    imageType: 'logo',
    logoBackground: 'transparent',
    outputFormat: 'png',
  });

  assert.equal(rendered.contentType, 'image/png');

  const sample = await sharp(rendered.body)
    .ensureAlpha()
    .raw()
    .toBuffer();
  assert.equal(sample[3], 0);
});

test('image route final composite renders dark logo canvases with opaque background', async () => {
  const rendered = await renderFinalCompositeImage({
    sharpFactory: sharp,
    overlays: [],
    outputWidth: 20,
    finalOutputHeight: 12,
    imageType: 'logo',
    logoBackground: 'dark',
    outputFormat: 'png',
  });

  const sample = await sharp(rendered.body)
    .ensureAlpha()
    .raw()
    .toBuffer();
  assert.deepEqual(Array.from(sample.slice(0, 4)), [17, 24, 39, 255]);
});

test('image route final composite supports jpeg encoding for non logo outputs', async () => {
  const rendered = await renderFinalCompositeImage({
    sharpFactory: sharp,
    overlays: [],
    outputWidth: 24,
    finalOutputHeight: 18,
    imageType: 'poster',
    logoBackground: 'transparent',
    outputFormat: 'jpeg',
  });

  assert.equal(rendered.contentType, 'image/jpeg');
  const metadata = await sharp(rendered.body).metadata();
  assert.equal(metadata.width, 24);
  assert.equal(metadata.height, 18);
  assert.equal(metadata.format, 'jpeg');
});
