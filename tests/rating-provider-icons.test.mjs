import test from 'node:test';
import assert from 'node:assert/strict';

import sharp from 'sharp';

import { RATING_PROVIDER_OPTIONS } from '../lib/ratingProviderCatalog.ts';
import {
  ALLOCINE_LOGO_DATA_URI,
  ALLOCINE_PRESS_LOGO_DATA_URI,
  METACRITIC_LOGO_DATA_URI,
  TRAKT_LOGO_DATA_URI,
} from '../lib/ratingProviderBrandAssets.ts';
import { resolveRatingProviderBadgeAppearance } from '../lib/ratingProviderIcons.ts';

const decodeSvgDataUri = (value) =>
  Buffer.from(decodeURIComponent(value.slice('data:image/svg+xml;charset=utf-8,'.length)));

test('kitsu embedded icon keeps transparent corners for plain badge rendering', async () => {
  const kitsu = RATING_PROVIDER_OPTIONS.find((provider) => provider.id === 'kitsu');
  assert.ok(kitsu);
  assert.match(kitsu.iconUrl, /^data:image\/png;base64,/);

  const base64 = kitsu.iconUrl.slice('data:image/png;base64,'.length);
  const buffer = Buffer.from(base64, 'base64');
  const metadata = await sharp(buffer).metadata();

  assert.equal(metadata.hasAlpha, true);
  assert.equal(metadata.width, 64);
  assert.equal(metadata.height, 64);

  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => data[(y * info.width + x) * info.channels + 3];

  assert.equal(alphaAt(0, 0), 0);
  assert.equal(alphaAt(info.width - 1, 0), 0);
  assert.equal(alphaAt(0, info.height - 1), 0);
  assert.equal(alphaAt(info.width - 1, info.height - 1), 0);
  assert.ok(alphaAt(Math.floor(info.width / 2), Math.floor(info.height / 2)) > 0);
});

test('smart provider icons switch embedded art for rotten tomatoes, metacritic, and trakt', () => {
  assert.equal(
    RATING_PROVIDER_OPTIONS.find((provider) => provider.id === 'allocine')?.iconUrl,
    ALLOCINE_LOGO_DATA_URI,
  );
  assert.equal(
    RATING_PROVIDER_OPTIONS.find((provider) => provider.id === 'allocinepress')?.iconUrl,
    ALLOCINE_PRESS_LOGO_DATA_URI,
  );
  assert.equal(
    RATING_PROVIDER_OPTIONS.find((provider) => provider.id === 'metacritic')?.iconUrl,
    METACRITIC_LOGO_DATA_URI,
  );
  assert.equal(
    RATING_PROVIDER_OPTIONS.find((provider) => provider.id === 'trakt')?.iconUrl,
    TRAKT_LOGO_DATA_URI,
  );

  const rtFresh = resolveRatingProviderBadgeAppearance({
    provider: 'tomatoes',
    label: 'Rotten Tomatoes',
    iconUrl: 'https://example.com/rt.png',
    accentColor: '#fa320a',
    sourceValue: '92%',
  });
  const rtRotten = resolveRatingProviderBadgeAppearance({
    provider: 'tomatoes',
    label: 'Rotten Tomatoes',
    iconUrl: 'https://example.com/rt.png',
    accentColor: '#fa320a',
    sourceValue: '41%',
  });
  const rtAudienceHot = resolveRatingProviderBadgeAppearance({
    provider: 'tomatoesaudience',
    label: 'RT Audience',
    iconUrl: 'https://example.com/rta.png',
    accentColor: '#f59e0b',
    sourceValue: '88%',
  });
  const rtAudienceCold = resolveRatingProviderBadgeAppearance({
    provider: 'tomatoesaudience',
    label: 'RT Audience',
    iconUrl: 'https://example.com/rta.png',
    accentColor: '#f59e0b',
    sourceValue: '32%',
  });
  const metacriticMustSee = resolveRatingProviderBadgeAppearance({
    provider: 'metacritic',
    label: 'Metacritic',
    iconUrl: 'https://example.com/meta.png',
    accentColor: '#66cc33',
    sourceValue: '88',
  });
  const metacriticUser = resolveRatingProviderBadgeAppearance({
    provider: 'metacriticuser',
    label: 'Metacritic User',
    iconUrl: 'https://example.com/meta-user.png',
    accentColor: '#4caf50',
    sourceValue: '8.4/10',
  });
  const trakt = resolveRatingProviderBadgeAppearance({
    provider: 'trakt',
    label: 'Trakt',
    iconUrl: 'https://example.com/trakt.png',
    accentColor: '#ed1c24',
    sourceValue: '7.8/10',
  });

  assert.match(rtFresh.iconUrl, /^data:image\/svg\+xml;charset=utf-8,/);
  assert.match(rtRotten.iconUrl, /^data:image\/svg\+xml;charset=utf-8,/);
  assert.notEqual(rtFresh.iconUrl, rtRotten.iconUrl);
  assert.equal(rtAudienceHot.label, 'RT Audience');
  assert.notEqual(rtAudienceHot.iconUrl, rtAudienceCold.iconUrl);
  assert.match(metacriticMustSee.iconUrl, /^data:image\/svg\+xml;charset=utf-8,/);
  assert.notEqual(metacriticMustSee.iconUrl, metacriticUser.iconUrl);
  assert.equal(metacriticUser.label, 'Metacritic User');
  assert.match(trakt.iconUrl, /^data:image\/svg\+xml;charset=utf-8,/);
});

test('allocine embedded icon uses the updated svg artwork', () => {
  assert.match(ALLOCINE_LOGO_DATA_URI, /^data:image\/svg\+xml;charset=utf-8,/);
  const svg = decodeSvgDataUri(ALLOCINE_LOGO_DATA_URI).toString('utf8');

  assert.match(svg, /fill="#fecc00"/);
  assert.match(svg, /stroke="#000000"/);
});

test('trakt embedded icon uses the official hosted favicon art', () => {
  const svg = decodeSvgDataUri(TRAKT_LOGO_DATA_URI).toString('utf8');

  assert.match(svg, /id="logomark\.square\.gradient"/);
  assert.match(svg, /id="checkbox"/);
  assert.match(svg, /id="radial-gradient"/);
  assert.match(svg, /class="cls-2"/);
});
