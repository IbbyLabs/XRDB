import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildNetworkBadgesFromTvNetworks,
  buildNetworkBadgesFromWatchProviderResults,
  buildMediaFeatureBadgesFromFlags,
  buildCertificationBadgeMeta,
  collectMediaFeatureFlags,
  hasMoviePhysicalMediaRelease,
  normalizeCertificationBadgeLabel,
  normalizeUserFacingMediaBadgeLabel,
  parseMediaFeatureFlagsFromFilename,
  resolveMovieCertificationBadge,
  resolveTvCertificationBadge,
} from '../lib/mediaFeatures.ts';
import {
  MEDIA_BADGE_ASSETS,
} from '../lib/mediaBadgeAssets.ts';

test('media feature parsing recognizes bluray premium audio video flags', () => {
  const flags = parseMediaFeatureFlagsFromFilename(
    'Movie.2024.2160p.BluRay.DoVi.Atmos.BDREMUX.mkv',
  );

  assert.deepEqual(flags, {
    has4k: true,
    hasBluray: true,
    hasHdr: true,
    hasDolbyVision: true,
    hasDolbyAtmos: true,
    hasRemux: true,
  });
});

test('media feature badges prefer bluray over remux and dolby vision over hdr', () => {
  const badges = buildMediaFeatureBadgesFromFlags({
    has4k: true,
    hasBluray: true,
    hasHdr: true,
    hasDolbyVision: true,
    hasDolbyAtmos: true,
    hasRemux: true,
  });

  assert.deepEqual(
    badges.map((badge) => badge.key),
    ['4k', 'bluray', 'dolbyvision', 'dolbyatmos'],
  );
  assert.deepEqual(
    badges.map((badge) => badge.label),
    ['4K', 'Bluray', 'Dolby Vision', 'Dolby Atmos'],
  );
});

test('remux sources also expose bluray coverage when explicit bluray tokens are absent', () => {
  const badges = buildMediaFeatureBadgesFromFlags({
    has4k: true,
    hasBluray: false,
    hasHdr: true,
    hasDolbyVision: true,
    hasDolbyAtmos: true,
    hasRemux: true,
  });

  assert.deepEqual(
    badges.map((badge) => badge.key),
    ['4k', 'bluray', 'dolbyvision', 'dolbyatmos', 'remux'],
  );
});

test('media badge assets stay embedded for renderer use', () => {
  assert.deepEqual(Object.keys(MEDIA_BADGE_ASSETS).sort(), [
    '4k',
    'bluray',
    'dolbyatmos',
    'dolbyvision',
    'hdr',
    'remux',
  ]);

  for (const asset of Object.values(MEDIA_BADGE_ASSETS)) {
    assert.match(asset.dataUri, /^data:image\/svg\+xml;base64,/);
    assert.ok(asset.aspectRatio > 1.5);
  }
});

test('media feature flag collection merges multiple filenames', () => {
  const flags = collectMediaFeatureFlags([
    'Movie.2024.2160p.WEB-DL.DV.mkv',
    'Movie.2024.Atmos.mkv',
  ]);

  assert.equal(flags.has4k, true);
  assert.equal(flags.hasDolbyVision, true);
  assert.equal(flags.hasDolbyAtmos, true);
  assert.equal(flags.hasBluray, false);
});

test('4k web streams do not infer bluray badges', () => {
  const flags = parseMediaFeatureFlagsFromFilename(
    'Movie.2024.2160p.WEB-DL.DV.HDR.Atmos.mkv',
  );

  assert.equal(flags.has4k, true);
  assert.equal(flags.hasBluray, false);
  assert.equal(
    buildMediaFeatureBadgesFromFlags(flags).some((badge) => badge.key === 'bluray'),
    false,
  );
});

test('certification labels remove user facing hyphens and unknown values', () => {
  assert.equal(normalizeCertificationBadgeLabel('pg-13'), 'PG 13');
  assert.equal(normalizeCertificationBadgeLabel('tv-ma'), 'TV MA');
  assert.equal(normalizeCertificationBadgeLabel('18+'), '18+');
  assert.equal(normalizeCertificationBadgeLabel('NR'), null);
});

test('generic media badge labels collapse user facing hyphens into spaces', () => {
  assert.equal(normalizeUserFacingMediaBadgeLabel('Blu-ray'), 'Bluray');
  assert.equal(normalizeUserFacingMediaBadgeLabel('Dolby-Atmos'), 'Dolby Atmos');
});

test('certification badge meta stores sanitized labels', () => {
  assert.equal(buildCertificationBadgeMeta('tv-ma').label, 'TV MA');
});

test('movie certification resolution prefers the requested region first', () => {
  const certification = resolveMovieCertificationBadge(
    {
      results: [
        {
          iso_3166_1: 'US',
          release_dates: [{ certification: 'PG-13', type: 3 }],
        },
        {
          iso_3166_1: 'GB',
          release_dates: [{ certification: '15', type: 3 }],
        },
      ],
    },
    'en-GB',
  );

  assert.equal(certification, '15');
});

test('movie physical media release only counts when a physical date has landed', () => {
  const beforeRelease = hasMoviePhysicalMediaRelease(
    {
      results: [
        {
          iso_3166_1: 'US',
          release_dates: [{ type: 5, release_date: '2026-04-15T00:00:00.000Z' }],
        },
      ],
    },
    Date.parse('2026-04-01T00:00:00.000Z'),
  );
  const afterRelease = hasMoviePhysicalMediaRelease(
    {
      results: [
        {
          iso_3166_1: 'US',
          release_dates: [{ type: 5, release_date: '2026-04-15T00:00:00.000Z' }],
        },
      ],
    },
    Date.parse('2026-04-16T00:00:00.000Z'),
  );

  assert.equal(beforeRelease, false);
  assert.equal(afterRelease, true);
});

test('tv certification resolution falls back to available regions', () => {
  const certification = resolveTvCertificationBadge(
    {
      results: [
        { iso_3166_1: 'US', rating: 'TV-MA' },
      ],
    },
    'fr',
  );

  assert.equal(certification, 'TV MA');
});

test('tv networks resolve to distinct network badges in media badge order', () => {
  const badges = buildNetworkBadgesFromTvNetworks([
    { name: 'HBO Max' },
    { name: 'Netflix' },
    { name: 'Prime Video' },
    { name: 'Unknown Network' },
    { name: 'HBO' },
  ]);

  assert.deepEqual(
    badges.map((badge) => badge.key),
    ['netflix', 'hbo', 'primevideo'],
  );
});

test('watch providers prefer the requested region and ignore rent only entries', () => {
  const badges = buildNetworkBadgesFromWatchProviderResults(
    {
      US: {
        flatrate: [{ provider_name: 'Netflix' }],
      },
      GB: {
        flatrate: [{ provider_name: 'Prime Video' }],
        rent: [{ provider_name: 'Apple TV' }],
      },
    },
    'en-GB',
  );

  assert.deepEqual(
    badges.map((badge) => badge.key),
    ['primevideo'],
  );
});

test('watch providers normalize ads variants and max channel names into badge keys', () => {
  const badges = buildNetworkBadgesFromWatchProviderResults({
    US: {
      flatrate: [
        { provider_name: 'Netflix Standard with Ads' },
        { provider_name: 'Max Amazon Channel' },
        { provider_name: 'Peacock Premium' },
      ],
    },
  });

  assert.deepEqual(
    badges.map((badge) => badge.key),
    ['netflix', 'hbo', 'peacock'],
  );
});
