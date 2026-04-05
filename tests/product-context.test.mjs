import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import packageJson from '../package.json' with { type: 'json' };
import { buildProductContext } from '../scripts/generate-product-context.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');

test('buildProductContext returns the expected schema and release tag', () => {
  const payload = buildProductContext({
    generatedAt: '2026-04-05T00:00:00.000Z',
    rootDir: repoRoot,
  });

  assert.equal(payload.artifactType, 'xrdb-product-context');
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.xrdbTag, `v${packageJson.version}`);
  assert.equal(payload.generatedAt, '2026-04-05T00:00:00.000Z');
  assert.equal(payload.productName, 'XRDB');
  assert.ok(Array.isArray(payload.introLines));
  assert.ok(payload.liveUrl.startsWith('https://'));
  assert.ok(payload.serverInvite.startsWith('https://discord.gg/'));
  assert.ok(Array.isArray(payload.sections));
  assert.ok(payload.sections.length >= 4);
});

test('buildProductContext includes core routes and capability sections', () => {
  const payload = buildProductContext({
    generatedAt: '2026-04-05T00:00:00.000Z',
    rootDir: repoRoot,
  });

  const headings = payload.sections.map((section) => section.heading);
  assert.ok(headings.includes('Primary XRDB routes and surfaces'));
  assert.ok(headings.includes('Recent XRDB feature highlights'));
  assert.ok(headings.includes('Output and export capabilities'));
  assert.ok(headings.includes('Metadata and proxy behavior'));

  const routeSection = payload.sections.find((section) => section.heading === 'Primary XRDB routes and surfaces');
  assert.ok(routeSection);
  assert.ok(routeSection.lines.some((line) => line.includes('/proxy/manifest.json')));
  assert.ok(routeSection.lines.some((line) => line.includes('/preview/[slug]')));

  const capabilitySection = payload.sections.find((section) => section.heading === 'Output and export capabilities');
  assert.ok(capabilitySection);
  assert.ok(capabilitySection.lines.some((line) => line.includes('Supported image outputs')));
  assert.ok(capabilitySection.lines.some((line) => line.includes('AIOMetadata')));
});