import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decodeProxyConfig,
  hasExplicitTmdbMediaTypeInXrdbId,
  isAmbiguousTmdbXrdbId,
  normalizeXrdbId,
} from '../lib/proxyConfigBridge.ts';
import {
  DEFAULT_QUALITY_BADGE_PREFERENCES,
  encodeRatingProviderAppearanceOverrides,
} from '../lib/badgeCustomization.ts';
import {
  buildAiometadataUrlPatterns,
  buildConfigString,
  buildProxyUrl,
  decodeBase64Url,
  normalizeSavedUiConfig,
  parseSavedUiConfig,
  serializeSavedUiConfig,
} from '../lib/uiConfig.ts';

const SAMPLE_PROVIDER_APPEARANCE = {
  trakt: {
    iconUrl: 'https://cdn.example.com/trakt-custom.svg',
    accentColor: '#7c3aed',
    iconScalePercent: 118,
    stackedWidthPercent: 86,
    stackedSurfaceOpacityPercent: 74,
    stackedAccentMode: 'logo',
    stackedLineVisible: false,
    stackedLineWidthPercent: 86,
  },
  imdb: {
    accentColor: '#facc15',
    stackedWidthPercent: 92,
    stackedLineHeightPercent: 124,
  },
};

const buildSampleSettings = () =>
  normalizeSavedUiConfig({
    settings: {
      xrdbKey: 'shared-xrdb-key-000',
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
      fanartKey: 'fanart-key-789',
      tmdbIdScope: 'strict',
      lang: 'fr',
      posterImageSize: 'large',
      backdropImageSize: 'normal',
      randomPosterText: 'any',
      randomPosterLanguage: 'any',
      randomPosterMinVoteCount: null,
      randomPosterMinVoteAverage: null,
      randomPosterMinWidth: null,
      randomPosterMinHeight: null,
      randomPosterFallback: 'best',
      posterImageText: 'clean',
      backdropImageText: 'clean',
      thumbnailImageText: 'clean',
      posterArtworkSource: 'fanart',
      backdropArtworkSource: 'fanart',
      thumbnailArtworkSource: 'fanart',
      logoArtworkSource: 'fanart',
      thumbnailEpisodeArtwork: 'still',
      backdropEpisodeArtwork: 'series',
      ratingValueMode: 'normalized',
      posterGenreBadgeMode: 'both',
      backdropGenreBadgeMode: 'off',
      thumbnailGenreBadgeMode: 'off',
      posterGenreBadgeStyle: 'square',
      backdropGenreBadgeStyle: 'glass',
      thumbnailGenreBadgeStyle: 'glass',
      posterGenreBadgePosition: 'bottomRight',
      backdropGenreBadgePosition: 'topLeft',
      thumbnailGenreBadgePosition: 'topLeft',
      posterGenreBadgeScale: 118,
      posterGenreBadgeAnimeGrouping: 'split',
      backdropGenreBadgeAnimeGrouping: 'split',
      thumbnailGenreBadgeAnimeGrouping: 'split',
      logoGenreBadgeMode: 'text',
      logoGenreBadgeStyle: 'plain',
      logoGenreBadgePosition: 'bottomCenter',
      logoGenreBadgeScale: 112,
      logoGenreBadgeAnimeGrouping: 'split',
      posterRatingPreferences: ['imdb', 'tmdb'],
      backdropRatingPreferences: ['mdblist'],
      thumbnailRatingPreferences: ['tmdb', 'imdb'],
      logoRatingPreferences: [],
      posterStreamBadges: 'on',
      backdropStreamBadges: 'off',
      thumbnailStreamBadges: 'off',
      qualityBadgesSide: 'right',
      posterQualityBadgesStyle: 'media',
      backdropQualityBadgesStyle: 'plain',
      thumbnailQualityBadgesStyle: 'plain',
      posterQualityBadgePreferences: ['certification', 'hdr', 'remux'],
      backdropQualityBadgePreferences: ['4k', 'dolbyatmos'],
      thumbnailQualityBadgePreferences: ['4k', 'dolbyatmos'],
      posterQualityBadgesMax: 2,
      backdropQualityBadgesMax: 3,
      thumbnailQualityBadgesMax: 3,
      posterRatingsLayout: 'top-bottom',
      backdropRatingsLayout: 'right-vertical',
      thumbnailRatingsLayout: 'right-vertical',
      posterRatingsMax: 5,
      backdropRatingsMax: 4,
      thumbnailRatingsMax: 4,
      backdropBottomRatingsRow: false,
      thumbnailBottomRatingsRow: false,
      posterEdgeOffset: 24,
      posterSideRatingsPosition: 'custom',
      posterSideRatingsOffset: 62,
      backdropSideRatingsPosition: 'custom',
      backdropSideRatingsOffset: 62,
      thumbnailSideRatingsPosition: 'custom',
      thumbnailSideRatingsOffset: 62,
      sideRatingsPosition: 'custom',
      sideRatingsOffset: 62,
      posterRatingStyle: 'square',
      backdropRatingStyle: 'plain',
      thumbnailRatingStyle: 'plain',
      logoRatingStyle: 'stacked',
      posterRatingBadgeScale: 114,
      backdropRatingBadgeScale: 108,
      thumbnailRatingBadgeScale: 108,
      logoRatingBadgeScale: 96,
      posterQualityBadgeScale: 120,
      backdropQualityBadgeScale: 104,
      thumbnailQualityBadgeScale: 104,
      posterRatingPresentation: 'minimal',
      backdropRatingPresentation: 'average',
      thumbnailRatingPresentation: 'average',
      logoRatingPresentation: 'blockbuster',
      posterRingValueSource: 'highest',
      posterRingProgressSource: 'tmdb',
      posterAggregateRatingSource: 'audience',
      backdropAggregateRatingSource: 'critics',
      thumbnailAggregateRatingSource: 'critics',
      logoAggregateRatingSource: 'overall',
      aggregateAccentMode: 'custom',
      aggregateAccentColor: '#22d3ee',
      aggregateCriticsAccentColor: '#f97316',
      aggregateAudienceAccentColor: '#22c55e',
      aggregateAccentBarOffset: -3,
      aggregateAccentBarVisible: true,
      ratingXOffsetPillGlass: 18,
      ratingYOffsetPillGlass: -14,
      ratingXOffsetSquare: -10,
      ratingYOffsetSquare: 12,
      posterRatingsMaxPerSide: 7,
      logoRatingsMax: 4,
      logoBackground: 'dark',
      logoBottomRatingsRow: false,
      ratingProviderAppearanceOverrides: SAMPLE_PROVIDER_APPEARANCE,
    },
    proxy: {
      manifestUrl: 'stremio://addon.example.com/manifest.json',
      translateMeta: true,
      translateMetaMode: 'prefer-requested-language',
      debugMetaTranslation: true,
      proxyTypes: ['movie', 'anime'],
      catalogRules: [{ key: 'movie:top', title: 'Cinema Prime', discoverOnly: true }],
    },
  });

test('workspace serialization round-trips shared settings and proxy state', () => {
  const config = buildSampleSettings();

  const raw = serializeSavedUiConfig(config);
  const parsed = parseSavedUiConfig(raw);

  assert.deepEqual(parsed, {
    version: 1,
    settings: {
      xrdbKey: 'shared-xrdb-key-000',
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
      fanartKey: 'fanart-key-789',
      simklClientId: '',
      tmdbIdScope: 'strict',
      lang: 'fr',
      posterImageSize: 'large',
      backdropImageSize: 'normal',
      randomPosterText: 'any',
      randomPosterLanguage: 'any',
      randomPosterMinVoteCount: null,
      randomPosterMinVoteAverage: null,
      randomPosterMinWidth: null,
      randomPosterMinHeight: null,
      randomPosterFallback: 'best',
      posterImageText: 'clean',
      backdropImageText: 'clean',
      thumbnailImageText: 'clean',
      posterArtworkSource: 'fanart',
      backdropArtworkSource: 'fanart',
      thumbnailArtworkSource: 'fanart',
      logoArtworkSource: 'fanart',
      thumbnailEpisodeArtwork: 'still',
      backdropEpisodeArtwork: 'series',
      ratingValueMode: 'normalized',
      posterGenreBadgeMode: 'both',
      backdropGenreBadgeMode: 'off',
      thumbnailGenreBadgeMode: 'off',
      logoGenreBadgeMode: 'text',
      posterGenreBadgeStyle: 'square',
      backdropGenreBadgeStyle: 'glass',
      thumbnailGenreBadgeStyle: 'glass',
      logoGenreBadgeStyle: 'plain',
      posterGenreBadgePosition: 'bottomRight',
      backdropGenreBadgePosition: 'topLeft',
      thumbnailGenreBadgePosition: 'topLeft',
      logoGenreBadgePosition: 'bottomCenter',
      posterGenreBadgeScale: 118,
      backdropGenreBadgeScale: 100,
      thumbnailGenreBadgeScale: 100,
      logoGenreBadgeScale: 112,
      posterGenreBadgeAnimeGrouping: 'split',
      backdropGenreBadgeAnimeGrouping: 'split',
      thumbnailGenreBadgeAnimeGrouping: 'split',
      logoGenreBadgeAnimeGrouping: 'split',
      posterRatingPreferences: ['imdb', 'tmdb'],
      backdropRatingPreferences: ['mdblist'],
      thumbnailRatingPreferences: ['tmdb', 'imdb'],
      logoRatingPreferences: [],
      posterStreamBadges: 'on',
      backdropStreamBadges: 'off',
      thumbnailStreamBadges: 'off',
      qualityBadgesSide: 'right',
      posterQualityBadgesPosition: 'auto',
      posterQualityBadgePreferences: ['certification', 'hdr', 'remux'],
      backdropQualityBadgePreferences: ['4k', 'dolbyatmos'],
      thumbnailQualityBadgePreferences: ['4k', 'dolbyatmos'],
      logoQualityBadgePreferences: [...DEFAULT_QUALITY_BADGE_PREFERENCES],
      posterQualityBadgesStyle: 'media',
      backdropQualityBadgesStyle: 'plain',
      thumbnailQualityBadgesStyle: 'plain',
      logoQualityBadgesStyle: 'glass',
      posterQualityBadgesMax: 2,
      backdropQualityBadgesMax: 3,
      thumbnailQualityBadgesMax: 3,
      logoQualityBadgesMax: null,
      posterRatingsLayout: 'top-bottom',
      backdropRatingsLayout: 'right-vertical',
      thumbnailRatingsLayout: 'right-vertical',
      posterRatingsMax: 5,
      backdropRatingsMax: 4,
      backdropBottomRatingsRow: false,
      thumbnailRatingsMax: 4,
      thumbnailBottomRatingsRow: false,
      posterEdgeOffset: 24,
      posterSideRatingsPosition: 'custom',
      posterSideRatingsOffset: 62,
      backdropSideRatingsPosition: 'custom',
      backdropSideRatingsOffset: 62,
      thumbnailSideRatingsPosition: 'custom',
      thumbnailSideRatingsOffset: 62,
      sideRatingsPosition: 'custom',
      sideRatingsOffset: 62,
      posterRatingStyle: 'square',
      backdropRatingStyle: 'plain',
      thumbnailRatingStyle: 'plain',
      logoRatingStyle: 'stacked',
      posterRatingBadgeScale: 114,
      backdropRatingBadgeScale: 108,
      thumbnailRatingBadgeScale: 108,
      logoRatingBadgeScale: 96,
      posterQualityBadgeScale: 120,
      backdropQualityBadgeScale: 104,
      thumbnailQualityBadgeScale: 104,
      logoQualityBadgeScale: 100,
      posterRatingPresentation: 'minimal',
      backdropRatingPresentation: 'average',
      thumbnailRatingPresentation: 'average',
      logoRatingPresentation: 'blockbuster',
      posterRingValueSource: 'highest',
      posterRingProgressSource: 'tmdb',
      posterAggregateRatingSource: 'audience',
      backdropAggregateRatingSource: 'critics',
      thumbnailAggregateRatingSource: 'critics',
      logoAggregateRatingSource: 'overall',
      aggregateAccentMode: 'custom',
      aggregateAccentColor: '#22d3ee',
      aggregateCriticsAccentColor: '#f97316',
      aggregateAudienceAccentColor: '#22c55e',
      aggregateAccentBarOffset: -3,
      aggregateAccentBarVisible: true,
      ratingXOffsetPillGlass: 18,
      ratingYOffsetPillGlass: -14,
      ratingXOffsetSquare: -10,
      ratingYOffsetSquare: 12,
      posterRatingsMaxPerSide: 7,
      logoRatingsMax: 4,
      logoBackground: 'dark',
      logoBottomRatingsRow: false,
      ratingProviderAppearanceOverrides: SAMPLE_PROVIDER_APPEARANCE,
    },
    proxy: {
      manifestUrl: 'https://addon.example.com/manifest.json',
      translateMeta: true,
      translateMetaMode: 'prefer-requested-language',
      debugMetaTranslation: true,
      proxyTypes: ['movie', 'anime'],
      episodeIdMode: 'imdb',
      catalogRules: [{ key: 'movie:top', title: 'Cinema Prime', discoverOnly: true }],
    },
  });

  const configString = buildConfigString('https://xrdb.example.com', parsed.settings);
  assert.notEqual(configString, '');
  const decodedConfig = JSON.parse(decodeBase64Url(configString));
  assert.equal(decodedConfig.tmdbIdScope, 'strict');
  assert.equal(decodedConfig.posterSideRatingsPosition, 'custom');
  assert.equal(decodedConfig.posterSideRatingsOffset, 62);
  assert.equal(decodedConfig.backdropSideRatingsPosition, 'custom');
  assert.equal(decodedConfig.backdropSideRatingsOffset, 62);
  assert.equal('sideRatingsPosition' in decodedConfig, false);
  assert.equal('sideRatingsOffset' in decodedConfig, false);
});

test('config payload keeps bottom row overrides lean and type scoped', () => {
  const config = normalizeSavedUiConfig({
    settings: {
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
      backdropRatingsLayout: 'right-vertical',
      backdropSideRatingsPosition: 'custom',
      backdropSideRatingsOffset: 62,
      backdropBottomRatingsRow: true,
      logoBottomRatingsRow: true,
    },
  });

  const configString = buildConfigString('https://xrdb.example.com', config.settings);
  assert.notEqual(configString, '');

  const decodedConfig = JSON.parse(decodeBase64Url(configString));
  assert.equal(decodedConfig.backdropBottomRatingsRow, true);
  assert.equal(decodedConfig.logoBottomRatingsRow, true);
  assert.equal('backdropRatingsLayout' in decodedConfig, false);
  assert.equal('backdropSideRatingsPosition' in decodedConfig, false);
  assert.equal('backdropSideRatingsOffset' in decodedConfig, false);
});

test('workspace normalization ignores legacy proxy enabled flags', () => {
  const config = normalizeSavedUiConfig({
    settings: {
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
    },
    proxy: {
      manifestUrl: 'https://addon.example.com/manifest.json',
      enabledTypes: {
        poster: false,
        backdrop: false,
        logo: false,
      },
    },
  });

  assert.deepEqual(config.proxy, {
    manifestUrl: 'https://addon.example.com/manifest.json',
    translateMeta: false,
    translateMetaMode: 'fill-missing',
    debugMetaTranslation: false,
    proxyTypes: ['movie', 'series', 'anime'],
    episodeIdMode: 'imdb',
    catalogRules: [],
  });
});

test('workspace normalization accepts hundred point rating value aliases and preserves them in payloads', () => {
  const config = normalizeSavedUiConfig({
    settings: {
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
      ratingValueMode: 'normalized-100',
    },
  });

  assert.equal(config.settings.ratingValueMode, 'normalized100');

  const configString = buildConfigString('https://xrdb.example.com', config.settings);
  assert.notEqual(configString, '');

  const decodedConfig = JSON.parse(decodeBase64Url(configString));
  assert.equal(decodedConfig.ratingValueMode, 'normalized100');
});

test('legacy shared genre badge settings expand to per type fields and re-compress in payloads', () => {
  const config = normalizeSavedUiConfig({
    settings: {
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
      genreBadgeMode: 'both',
      genreBadgeStyle: 'square',
      genreBadgePosition: 'bottomRight',
      genreBadgeScale: 118,
    },
  });

  assert.equal(config.settings.posterGenreBadgeMode, 'both');
  assert.equal(config.settings.backdropGenreBadgeMode, 'both');
  assert.equal(config.settings.logoGenreBadgeMode, 'both');
  assert.equal(config.settings.posterGenreBadgeStyle, 'square');
  assert.equal(config.settings.backdropGenreBadgeStyle, 'square');
  assert.equal(config.settings.logoGenreBadgeStyle, 'square');
  assert.equal(config.settings.posterGenreBadgePosition, 'bottomRight');
  assert.equal(config.settings.backdropGenreBadgePosition, 'bottomRight');
  assert.equal(config.settings.logoGenreBadgePosition, 'bottomRight');
  assert.equal(config.settings.posterGenreBadgeScale, 118);
  assert.equal(config.settings.backdropGenreBadgeScale, 118);
  assert.equal(config.settings.logoGenreBadgeScale, 118);

  const configString = buildConfigString('https://xrdb.example.com', config.settings);
  assert.notEqual(configString, '');

  const decodedConfig = JSON.parse(decodeBase64Url(configString));
  assert.equal(decodedConfig.genreBadge, 'both');
  assert.equal(decodedConfig.genreBadgeStyle, 'square');
  assert.equal(decodedConfig.genreBadgePosition, 'bottomRight');
  assert.equal(decodedConfig.genreBadgeScale, 118);
  assert.equal(decodedConfig.posterGenreBadge, undefined);
  assert.equal(decodedConfig.backdropGenreBadge, undefined);
  assert.equal(decodedConfig.logoGenreBadge, undefined);
});

test('workspace normalization preserves compact dual aggregate presentation aliases', () => {
  const config = normalizeSavedUiConfig({
    settings: {
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
      posterRatingPresentation: 'dual-minimal',
      backdropRatingPresentation: 'compact-dual',
    },
  });

  assert.equal(config.settings.posterRatingPresentation, 'dual-minimal');
  assert.equal(config.settings.backdropRatingPresentation, 'dual-minimal');

  const configString = buildConfigString('https://xrdb.example.com', config.settings);
  assert.notEqual(configString, '');

  const decodedConfig = JSON.parse(decodeBase64Url(configString));
  assert.equal(decodedConfig.posterRatingPresentation, 'dual-minimal');
  assert.equal(decodedConfig.backdropRatingPresentation, 'dual-minimal');
});

test('workspace normalization preserves compact ring source settings in config payloads', () => {
  const config = normalizeSavedUiConfig({
    settings: {
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
      posterRatingPresentation: 'ring',
      posterRingValueSource: 'highest',
      posterRingProgressSource: 'tomatoes',
    },
  });

  assert.equal(config.settings.posterRatingPresentation, 'ring');
  assert.equal(config.settings.posterRingValueSource, 'highest');
  assert.equal(config.settings.posterRingProgressSource, 'tomatoes');

  const configString = buildConfigString('https://xrdb.example.com', config.settings);
  assert.notEqual(configString, '');

  const decodedConfig = JSON.parse(decodeBase64Url(configString));
  assert.equal(decodedConfig.posterRatingPresentation, 'ring');
  assert.equal(decodedConfig.posterRingProgressSource, 'tomatoes');
  assert.equal('posterRingValueSource' in decodedConfig, false);
});

test('workspace normalization accepts none rating presentation to remove all ratings', () => {
  const config = normalizeSavedUiConfig({
    settings: {
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
      posterRatingPresentation: 'none',
      backdropRatingPresentation: 'none',
      logoRatingPresentation: 'none',
    },
  });

  assert.equal(config.settings.posterRatingPresentation, 'none');
  assert.equal(config.settings.backdropRatingPresentation, 'none');
  assert.equal(config.settings.logoRatingPresentation, 'none');

  const configString = buildConfigString('https://xrdb.example.com', config.settings);
  assert.notEqual(configString, '');

  const decodedConfig = JSON.parse(decodeBase64Url(configString));
  assert.equal(decodedConfig.posterRatingPresentation, 'none');
  assert.equal(decodedConfig.backdropRatingPresentation, 'none');
  assert.equal(decodedConfig.logoRatingPresentation, 'none');
});

test('config payload includes aggregate accent bar visibility when disabled', () => {
  const config = normalizeSavedUiConfig({
    settings: {
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
      aggregateAccentBarVisible: false,
    },
  });

  assert.equal(config.settings.aggregateAccentBarVisible, false);

  const configString = buildConfigString('https://xrdb.example.com', config.settings);
  assert.notEqual(configString, '');
  const decodedConfig = JSON.parse(decodeBase64Url(configString));
  assert.equal(decodedConfig.aggregateAccentBarVisible, false);
});

test('config payload keeps random poster criteria when configured', () => {
  const config = normalizeSavedUiConfig({
    settings: {
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
      posterImageText: 'random',
      randomPosterText: 'textless',
      randomPosterLanguage: 'requested',
      randomPosterMinVoteCount: 25,
      randomPosterMinVoteAverage: 7.1,
      randomPosterMinWidth: 1200,
      randomPosterMinHeight: 1800,
      randomPosterFallback: 'original',
    },
  });

  assert.equal(config.settings.randomPosterText, 'textless');
  assert.equal(config.settings.randomPosterLanguage, 'requested');
  assert.equal(config.settings.randomPosterMinVoteCount, 25);
  assert.equal(config.settings.randomPosterMinVoteAverage, 7.1);
  assert.equal(config.settings.randomPosterMinWidth, 1200);
  assert.equal(config.settings.randomPosterMinHeight, 1800);
  assert.equal(config.settings.randomPosterFallback, 'original');

  const configString = buildConfigString('https://xrdb.example.com', config.settings);
  assert.notEqual(configString, '');
  const decodedConfig = JSON.parse(decodeBase64Url(configString));
  assert.equal(decodedConfig.posterImageText, 'random');
  assert.equal(decodedConfig.randomPosterText, 'textless');
  assert.equal(decodedConfig.randomPosterLanguage, 'requested');
  assert.equal(decodedConfig.randomPosterMinVoteCount, 25);
  assert.equal(decodedConfig.randomPosterMinVoteAverage, 7.1);
  assert.equal(decodedConfig.randomPosterMinWidth, 1200);
  assert.equal(decodedConfig.randomPosterMinHeight, 1800);
  assert.equal(decodedConfig.randomPosterFallback, 'original');
});

test('config string and proxy manifest use the same shared XRDB settings', () => {
  const config = buildSampleSettings();
  const baseUrl = 'https://xrdb.example.com/';

  const configString = buildConfigString(baseUrl, config.settings);
  assert.notEqual(configString, '');

  const decodedConfig = JSON.parse(decodeBase64Url(configString));
  assert.deepEqual(decodedConfig, {
    baseUrl: 'https://xrdb.example.com',
    xrdbKey: 'shared-xrdb-key-000',
    tmdbKey: 'tmdb-key-123',
    mdblistKey: 'mdblist-key-456',
    fanartKey: 'fanart-key-789',
    tmdbIdScope: 'strict',
    posterRatings: 'imdb,tmdb',
    backdropRatings: 'mdblist',
    thumbnailRatings: 'tmdb,imdb',
    logoRatings: '',
    lang: 'fr',
    ratingValueMode: 'normalized',
    posterGenreBadge: 'both',
    logoGenreBadge: 'text',
    posterGenreBadgeStyle: 'square',
    logoGenreBadgeStyle: 'plain',
    posterGenreBadgePosition: 'bottomRight',
    logoGenreBadgePosition: 'bottomCenter',
    posterGenreBadgeScale: 118,
    logoGenreBadgeScale: 112,
    posterStreamBadges: 'on',
    backdropStreamBadges: 'off',
    thumbnailStreamBadges: 'off',
    qualityBadgesSide: 'right',
    posterQualityBadges: 'certification,hdr,remux',
    backdropQualityBadges: '4k,dolbyatmos',
    thumbnailQualityBadges: '4k,dolbyatmos',
    posterQualityBadgesStyle: 'media',
    backdropQualityBadgesStyle: 'plain',
    thumbnailQualityBadgesStyle: 'plain',
    posterQualityBadgesMax: 2,
    backdropQualityBadgesMax: 3,
    thumbnailQualityBadgesMax: 3,
    posterRatingStyle: 'square',
    backdropRatingStyle: 'plain',
    thumbnailRatingStyle: 'plain',
    logoRatingStyle: 'stacked',
    posterRatingBadgeScale: 114,
    backdropRatingBadgeScale: 108,
    thumbnailRatingBadgeScale: 108,
    logoRatingBadgeScale: 96,
    posterQualityBadgeScale: 120,
    backdropQualityBadgeScale: 104,
    thumbnailQualityBadgeScale: 104,
    posterRatingPresentation: 'minimal',
    backdropRatingPresentation: 'average',
    thumbnailRatingPresentation: 'average',
    logoRatingPresentation: 'blockbuster',
    posterAggregateRatingSource: 'audience',
    backdropAggregateRatingSource: 'critics',
    thumbnailAggregateRatingSource: 'critics',
    aggregateAccentMode: 'custom',
    aggregateAccentColor: '#22d3ee',
    aggregateCriticsAccentColor: '#f97316',
    aggregateAudienceAccentColor: '#22c55e',
    aggregateAccentBarOffset: -3,
    ratingXOffsetPillGlass: 18,
    ratingYOffsetPillGlass: -14,
    ratingXOffsetSquare: -10,
    ratingYOffsetSquare: 12,
    posterImageSize: 'large',
    posterImageText: 'clean',
    backdropImageText: 'clean',
    thumbnailImageText: 'clean',
    posterArtworkSource: 'fanart',
    backdropArtworkSource: 'fanart',
    thumbnailArtworkSource: 'fanart',
    posterRatingsLayout: 'top-bottom',
    posterRatingsMax: 5,
    posterEdgeOffset: 24,
    backdropRatingsLayout: 'right-vertical',
    backdropRatingsMax: 4,
    thumbnailRatingsLayout: 'right-vertical',
    thumbnailRatingsMax: 4,
    posterSideRatingsPosition: 'custom',
    posterSideRatingsOffset: 62,
    backdropSideRatingsPosition: 'custom',
    backdropSideRatingsOffset: 62,
    thumbnailSideRatingsPosition: 'custom',
    thumbnailSideRatingsOffset: 62,
    logoRatingsMax: 4,
    logoBackground: 'dark',
    logoArtworkSource: 'fanart',
    providerAppearance: encodeRatingProviderAppearanceOverrides(SAMPLE_PROVIDER_APPEARANCE),
  });

  const proxyUrl = buildProxyUrl(baseUrl, config.proxy, config.settings);
  assert.match(proxyUrl, /^https:\/\/xrdb\.example\.com\/proxy\/.+\/manifest\.json$/);

  const encodedConfig = proxyUrl.split('/proxy/')[1]?.replace('/manifest.json', '');
  assert.ok(encodedConfig);

  const decodedProxy = decodeProxyConfig(encodedConfig);
  assert.deepEqual(decodedProxy, {
    url: 'https://addon.example.com/manifest.json',
    xrdbKey: 'shared-xrdb-key-000',
    tmdbKey: 'tmdb-key-123',
    mdblistKey: 'mdblist-key-456',
    fanartKey: 'fanart-key-789',
    tmdbIdScope: 'strict',
    translateMeta: true,
    translateMetaMode: 'prefer-requested-language',
    debugMetaTranslation: true,
    proxyTypes: 'movie,anime',
    posterRatings: 'imdb,tmdb',
    backdropRatings: 'mdblist',
    thumbnailRatings: 'tmdb,imdb',
    logoRatings: '',
    lang: 'fr',
    ratingValueMode: 'normalized',
    posterGenreBadge: 'both',
    logoGenreBadge: 'text',
    posterGenreBadgeStyle: 'square',
    logoGenreBadgeStyle: 'plain',
    posterGenreBadgePosition: 'bottomRight',
    logoGenreBadgePosition: 'bottomCenter',
    posterGenreBadgeScale: '118',
    logoGenreBadgeScale: '112',
    posterStreamBadges: 'on',
    backdropStreamBadges: 'off',
    thumbnailStreamBadges: 'off',
    qualityBadgesSide: 'right',
    posterQualityBadges: 'certification,hdr,remux',
    backdropQualityBadges: '4k,dolbyatmos',
    thumbnailQualityBadges: '4k,dolbyatmos',
    posterQualityBadgesStyle: 'media',
    backdropQualityBadgesStyle: 'plain',
    thumbnailQualityBadgesStyle: 'plain',
    posterQualityBadgeScale: '120',
    backdropQualityBadgeScale: '104',
    thumbnailQualityBadgeScale: '104',
    posterQualityBadgesMax: '2',
    backdropQualityBadgesMax: '3',
    thumbnailQualityBadgesMax: '3',
    posterRatingStyle: 'square',
    backdropRatingStyle: 'plain',
    thumbnailRatingStyle: 'plain',
    logoRatingStyle: 'stacked',
    posterRatingBadgeScale: '114',
    backdropRatingBadgeScale: '108',
    thumbnailRatingBadgeScale: '108',
    logoRatingBadgeScale: '96',
    posterRatingPresentation: 'minimal',
    backdropRatingPresentation: 'average',
    thumbnailRatingPresentation: 'average',
    logoRatingPresentation: 'blockbuster',
    posterAggregateRatingSource: 'audience',
    backdropAggregateRatingSource: 'critics',
    thumbnailAggregateRatingSource: 'critics',
    aggregateAccentMode: 'custom',
    aggregateAccentColor: '#22d3ee',
    aggregateCriticsAccentColor: '#f97316',
    aggregateAudienceAccentColor: '#22c55e',
    aggregateAccentBarOffset: '-3',
    ratingXOffsetPillGlass: '18',
    ratingYOffsetPillGlass: '-14',
    ratingXOffsetSquare: '-10',
    ratingYOffsetSquare: '12',
    posterImageSize: 'large',
    posterImageText: 'clean',
    backdropImageText: 'clean',
    thumbnailImageText: 'clean',
    posterArtworkSource: 'fanart',
    backdropArtworkSource: 'fanart',
    thumbnailArtworkSource: 'fanart',
    posterRatingsLayout: 'top-bottom',
    posterRatingsMax: '5',
    posterEdgeOffset: '24',
    backdropRatingsLayout: 'right-vertical',
    backdropRatingsMax: '4',
    thumbnailRatingsLayout: 'right-vertical',
    thumbnailRatingsMax: '4',
    posterSideRatingsPosition: 'custom',
    posterSideRatingsOffset: '62',
    backdropSideRatingsPosition: 'custom',
    backdropSideRatingsOffset: '62',
    thumbnailSideRatingsPosition: 'custom',
    thumbnailSideRatingsOffset: '62',
    logoRatingsMax: '4',
    logoBackground: 'dark',
    logoArtworkSource: 'fanart',
    providerAppearance: encodeRatingProviderAppearanceOverrides(SAMPLE_PROVIDER_APPEARANCE),
    catalogPlan: Buffer.from(
      JSON.stringify([{ key: 'movie:top', title: 'Cinema Prime', discoverOnly: true }]),
    ).toString('base64url'),
    xrdbBase: 'https://xrdb.example.com',
  });
});

test('AIOMetadata export builds masked patterns with placeholders', () => {
  const config = buildSampleSettings();

  const patterns = buildAiometadataUrlPatterns('https://xrdb.example.com/', config.settings, {
    hideCredentials: true,
  });

  assert.equal(
    patterns?.posterUrlPattern.startsWith(
      'https://xrdb.example.com/poster/tmdb:{type}:{tmdb_id}.jpg?idSource=tmdb&',
    ),
    true,
  );
  assert.equal(
    patterns?.backgroundUrlPattern.startsWith(
      'https://xrdb.example.com/backdrop/tmdb:{type}:{tmdb_id}.jpg?idSource=tmdb&',
    ),
    true,
  );
  assert.equal(
    patterns?.logoUrlPattern.startsWith(
      'https://xrdb.example.com/logo/tmdb:{type}:{tmdb_id}.png?idSource=tmdb&',
    ),
    true,
  );
  assert.equal(
    patterns?.episodeThumbnailUrlPattern.startsWith(
      'https://xrdb.example.com/thumbnail/{imdb_id}/S{season}E{episode}.jpg?',
    ),
    true,
  );

  for (const value of Object.values(patterns ?? {})) {
    assert.match(value, /xrdbKey=\{xrdb_key\}/);
    assert.match(value, /tmdbKey=\{tmdb_key\}/);
    assert.match(value, /mdblistKey=\{mdblist_key\}/);
    assert.match(value, /fanartKey=\{fanart_key\}/);
    assert.match(value, /lang=fr/);
    assert.match(value, /aggregateAccentMode=custom/);
    assert.match(value, /aggregateAccentColor=%2322d3ee/);
    assert.match(value, /aggregateCriticsAccentColor=%23f97316/);
    assert.match(value, /aggregateAudienceAccentColor=%2322c55e/);
    assert.match(value, /aggregateAccentBarOffset=-3/);
    assert.match(value, /ratingXOffsetPillGlass=18/);
    assert.match(value, /ratingYOffsetPillGlass=-14/);
    assert.match(value, /ratingXOffsetSquare=-10/);
    assert.match(value, /ratingYOffsetSquare=12/);
    assert.match(
      value,
      new RegExp(`providerAppearance=${encodeRatingProviderAppearanceOverrides(SAMPLE_PROVIDER_APPEARANCE)}`),
    );
    assert.equal(value.includes('%7Btmdb_key%7D'), false);
    assert.equal(value.includes('%7Bmdblist_key%7D'), false);
    assert.equal(value.includes('%7Bfanart_key%7D'), false);
    assert.equal(value.includes('%7Bxrdb_key%7D'), false);
  }

  assert.match(patterns?.posterUrlPattern ?? '', /posterRatings=imdb%2Ctmdb/);
  assert.match(patterns?.posterUrlPattern ?? '', /posterRatingsLayout=top-bottom/);
  assert.match(patterns?.posterUrlPattern ?? '', /posterEdgeOffset=24/);
  assert.match(patterns?.posterUrlPattern ?? '', /posterSideRatingsPosition=custom/);
  assert.match(patterns?.posterUrlPattern ?? '', /posterSideRatingsOffset=62/);
  assert.match(patterns?.posterUrlPattern ?? '', /qualityBadgesSide=right/);
  assert.equal((patterns?.posterUrlPattern ?? '').includes('backdropRatings='), false);
  assert.equal((patterns?.posterUrlPattern ?? '').includes('logoRatings='), false);
  assert.equal((patterns?.posterUrlPattern ?? '').includes('backdropRatingsLayout='), false);

  assert.match(patterns?.backgroundUrlPattern ?? '', /backdropRatings=mdblist/);
  assert.match(patterns?.backgroundUrlPattern ?? '', /backdropRatingsLayout=right-vertical/);
  assert.match(patterns?.backgroundUrlPattern ?? '', /backdropSideRatingsPosition=custom/);
  assert.match(patterns?.backgroundUrlPattern ?? '', /backdropSideRatingsOffset=62/);
  assert.equal((patterns?.backgroundUrlPattern ?? '').includes('backdropEpisodeArtwork='), false);
  assert.equal((patterns?.backgroundUrlPattern ?? '').includes('posterRatings='), false);
  assert.equal((patterns?.backgroundUrlPattern ?? '').includes('logoRatings='), false);
  assert.equal((patterns?.backgroundUrlPattern ?? '').includes('qualityBadgesSide='), false);

  assert.match(patterns?.logoUrlPattern ?? '', /logoRatings=/);
  assert.equal((patterns?.logoUrlPattern ?? '').includes('backdropEpisodeArtwork='), false);
  assert.equal((patterns?.logoUrlPattern ?? '').includes('thumbnailEpisodeArtwork='), false);
  assert.equal((patterns?.logoUrlPattern ?? '').includes('posterRatings='), false);
  assert.equal((patterns?.logoUrlPattern ?? '').includes('backdropRatings='), false);
  assert.equal((patterns?.logoUrlPattern ?? '').includes('qualityBadgesSide='), false);

  assert.match(patterns?.episodeThumbnailUrlPattern ?? '', /thumbnailRatings=tmdb%2Cimdb/);
  assert.match(patterns?.episodeThumbnailUrlPattern ?? '', /thumbnailRatingsLayout=right-vertical/);
  assert.match(patterns?.episodeThumbnailUrlPattern ?? '', /thumbnailSideRatingsPosition=custom/);
  assert.match(patterns?.episodeThumbnailUrlPattern ?? '', /thumbnailSideRatingsOffset=62/);
  assert.match(patterns?.episodeThumbnailUrlPattern ?? '', /thumbnailRatingStyle=plain/);
  assert.match(patterns?.episodeThumbnailUrlPattern ?? '', /thumbnailImageText=clean/);
  assert.match(patterns?.episodeThumbnailUrlPattern ?? '', /thumbnailArtworkSource=fanart/);
  assert.equal((patterns?.episodeThumbnailUrlPattern ?? '').includes('posterRatings='), false);
  assert.equal((patterns?.episodeThumbnailUrlPattern ?? '').includes('backdropRatings='), false);
  assert.equal((patterns?.episodeThumbnailUrlPattern ?? '').includes('logoRatings='), false);
  assert.equal((patterns?.episodeThumbnailUrlPattern ?? '').includes('posterRatingStyle='), false);
  assert.equal((patterns?.episodeThumbnailUrlPattern ?? '').includes('logoRatingStyle='), false);
  assert.equal((patterns?.episodeThumbnailUrlPattern ?? '').includes('posterImageText='), false);
  assert.equal((patterns?.episodeThumbnailUrlPattern ?? '').includes('qualityBadgesSide='), false);

  assert.match(patterns?.backgroundUrlPattern ?? '', /idSource=tmdb/);
  assert.match(patterns?.logoUrlPattern ?? '', /idSource=tmdb/);
  assert.match(patterns?.posterUrlPattern ?? '', /idSource=tmdb/);
  assert.match(patterns?.posterUrlPattern ?? '', /posterImageSize=large/);
  assert.equal((patterns?.posterUrlPattern ?? '').includes('backdropEpisodeArtwork='), false);
  assert.equal((patterns?.posterUrlPattern ?? '').includes('thumbnailEpisodeArtwork='), false);
  assert.equal((patterns?.episodeThumbnailUrlPattern ?? '').includes('thumbnailEpisodeArtwork='), false);
  assert.equal((patterns?.episodeThumbnailUrlPattern ?? '').includes('backdropEpisodeArtwork='), false);
});

test('AIOMetadata export can keep live credentials while preserving live AIOM defaults', () => {
  const config = buildSampleSettings();

  const patterns = buildAiometadataUrlPatterns('https://xrdb.example.com/', config.settings, {
    hideCredentials: false,
  });

  assert.equal(
    patterns?.posterUrlPattern.startsWith(
      'https://xrdb.example.com/poster/tmdb:{type}:{tmdb_id}.jpg?idSource=tmdb&',
    ),
    true,
  );
  assert.equal(
    patterns?.backgroundUrlPattern.startsWith(
      'https://xrdb.example.com/backdrop/tmdb:{type}:{tmdb_id}.jpg?idSource=tmdb&',
    ),
    true,
  );
  assert.equal(
    patterns?.logoUrlPattern.startsWith(
      'https://xrdb.example.com/logo/tmdb:{type}:{tmdb_id}.png?idSource=tmdb&',
    ),
    true,
  );
  assert.equal(
    patterns?.episodeThumbnailUrlPattern.startsWith(
      'https://xrdb.example.com/thumbnail/{imdb_id}/S{season}E{episode}.jpg?',
    ),
    true,
  );

  for (const value of Object.values(patterns ?? {})) {
    assert.match(value, /tmdbKey=tmdb-key-123/);
    assert.match(value, /mdblistKey=mdblist-key-456/);
    assert.match(value, /xrdbKey=shared-xrdb-key-000/);
    assert.match(value, /fanartKey=fanart-key-789/);
  }
});

test('AIOMetadata export auto poster ID mode resolves to typed TMDB poster URLs', () => {
  const config = buildSampleSettings();

  const patterns = buildAiometadataUrlPatterns('https://xrdb.example.com/', config.settings, {
    hideCredentials: true,
    posterIdMode: 'auto',
  });

  assert.equal(
    patterns?.posterUrlPattern.startsWith(
      'https://xrdb.example.com/poster/tmdb:{type}:{tmdb_id}.jpg?idSource=tmdb&',
    ),
    true,
  );
});

test('AIOMetadata export keeps tmdb poster ID mode as an auto alias for older workspaces', () => {
  const config = buildSampleSettings();

  const patterns = buildAiometadataUrlPatterns('https://xrdb.example.com/', config.settings, {
    hideCredentials: true,
    posterIdMode: 'tmdb',
  });

  assert.equal(
    patterns?.posterUrlPattern.startsWith(
      'https://xrdb.example.com/poster/tmdb:{type}:{tmdb_id}.jpg?idSource=tmdb&',
    ),
    true,
  );
});

test('AIOMetadata export supports IMDb poster ID mode override', () => {
  const config = buildSampleSettings();

  const patterns = buildAiometadataUrlPatterns('https://xrdb.example.com/', config.settings, {
    hideCredentials: true,
    posterIdMode: 'imdb',
  });

  assert.equal(patterns?.posterUrlPattern.startsWith('https://xrdb.example.com/poster/{imdb_id}.jpg?'), true);
  assert.equal((patterns?.posterUrlPattern ?? '').includes('idSource=tmdb'), false);
  assert.match(patterns?.backgroundUrlPattern ?? '', /idSource=tmdb/);
  assert.match(patterns?.logoUrlPattern ?? '', /idSource=tmdb/);
});

test('AIOMetadata export keeps bottom row overrides and omits overridden backdrop layout params', () => {
  const config = normalizeSavedUiConfig({
    settings: {
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
      backdropRatingsLayout: 'right-vertical',
      backdropSideRatingsPosition: 'custom',
      backdropSideRatingsOffset: 62,
      backdropBottomRatingsRow: true,
      logoBottomRatingsRow: true,
    },
  });

  const patterns = buildAiometadataUrlPatterns('https://xrdb.example.com/', config.settings, {
    hideCredentials: true,
  });

  assert.match(patterns?.backgroundUrlPattern ?? '', /backdropBottomRatingsRow=true/);
  assert.equal((patterns?.backgroundUrlPattern ?? '').includes('backdropRatingsLayout='), false);
  assert.equal((patterns?.backgroundUrlPattern ?? '').includes('backdropSideRatingsPosition='), false);
  assert.equal((patterns?.backgroundUrlPattern ?? '').includes('backdropSideRatingsOffset='), false);
  assert.match(patterns?.logoUrlPattern ?? '', /logoBottomRatingsRow=true/);
});

test('AIOMetadata export keeps OMDb poster source lean and poster scoped', () => {
  const config = normalizeSavedUiConfig({
    settings: {
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
      fanartKey: 'fanart-key-789',
      posterArtworkSource: 'omdb',
    },
  });

  const patterns = buildAiometadataUrlPatterns('https://xrdb.example.com/', config.settings, {
    hideCredentials: true,
  });

  assert.match(patterns?.posterUrlPattern ?? '', /posterArtworkSource=omdb/);
  assert.equal((patterns?.posterUrlPattern ?? '').includes('fanartKey='), false);
  assert.equal((patterns?.backgroundUrlPattern ?? '').includes('posterArtworkSource=omdb'), false);
  assert.equal((patterns?.logoUrlPattern ?? '').includes('posterArtworkSource=omdb'), false);
});

test('proxy manifest generation stops when required inputs are missing', () => {
  const config = buildSampleSettings();

  assert.equal(
    buildProxyUrl('https://xrdb.example.com', { ...config.proxy, manifestUrl: '' }, config.settings),
    '',
  );

  assert.equal(
    buildProxyUrl(
      'https://xrdb.example.com',
      {
        ...config.proxy,
        manifestUrl: 'https://addon.example.com/manifest.json',
      },
      {
        ...config.settings,
        tmdbKey: '',
      },
    ),
    '',
  );
});

test('workspace normalization accepts spaced layout values from the page docs', () => {
  const config = normalizeSavedUiConfig({
    settings: {
      posterRatingsLayout: 'left right',
      backdropRatingsLayout: 'right vertical',
    },
  });

  assert.equal(config.settings.posterRatingsLayout, 'left-right');
  assert.equal(config.settings.backdropRatingsLayout, 'right-vertical');
});

test('workspace normalization clamps poster edge offset into the supported range', () => {
  const config = normalizeSavedUiConfig({
    settings: {
      posterEdgeOffset: 999,
    },
  });

  assert.equal(config.settings.posterEdgeOffset, 80);
});

test('workspace normalization maps legacy fanart poster mode into artwork source state', () => {
  const config = normalizeSavedUiConfig({
    settings: {
      posterImageText: 'fanartclean',
      backdropImageText: 'fanartclean',
    },
  });

  assert.equal(config.settings.posterImageText, 'clean');
  assert.equal(config.settings.backdropImageText, 'clean');
  assert.equal(config.settings.posterArtworkSource, 'fanart');
  assert.equal(config.settings.backdropArtworkSource, 'fanart');
});

test('workspace normalization accepts random artwork and image text preferences', () => {
  const config = normalizeSavedUiConfig({
    settings: {
      posterImageText: 'random',
      backdropImageText: 'random',
      posterArtworkSource: 'random',
      backdropArtworkSource: 'random',
      logoArtworkSource: 'random',
    },
  });

  assert.equal(config.settings.posterImageText, 'random');
  assert.equal(config.settings.backdropImageText, 'random');
  assert.equal(config.settings.posterArtworkSource, 'random');
  assert.equal(config.settings.backdropArtworkSource, 'random');
  assert.equal(config.settings.logoArtworkSource, 'random');
});

test('workspace normalization accepts poster image size aliases and payload omits default', () => {
  const aliasNormalized = normalizeSavedUiConfig({
    settings: {
      posterImageSize: '4k-slow',
    },
  });
  assert.equal(aliasNormalized.settings.posterImageSize, '4k');

  const defaultNormalized = normalizeSavedUiConfig({
    settings: {
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
      posterImageSize: 'standard',
    },
  });
  assert.equal(defaultNormalized.settings.posterImageSize, 'normal');

  const defaultConfigString = buildConfigString('https://xrdb.example.com', defaultNormalized.settings);
  assert.notEqual(defaultConfigString, '');
  const defaultPayload = JSON.parse(decodeBase64Url(defaultConfigString));
  assert.equal(defaultPayload.posterImageSize, undefined);
});

test('workspace normalization accepts backdrop image size aliases and payload omits default', () => {
  const aliasNormalized = normalizeSavedUiConfig({
    settings: {
      backdropImageSize: '4k-slow',
    },
  });
  assert.equal(aliasNormalized.settings.backdropImageSize, '4k');

  const defaultNormalized = normalizeSavedUiConfig({
    settings: {
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
      backdropImageSize: 'standard',
    },
  });
  assert.equal(defaultNormalized.settings.backdropImageSize, 'normal');

  const defaultConfigString = buildConfigString('https://xrdb.example.com', defaultNormalized.settings);
  assert.notEqual(defaultConfigString, '');
  const defaultPayload = JSON.parse(decodeBase64Url(defaultConfigString));
  assert.equal(defaultPayload.backdropImageSize, undefined);

  const explicitConfigString = buildConfigString('https://xrdb.example.com', {
    ...defaultNormalized.settings,
    backdropImageSize: 'large',
  });
  assert.notEqual(explicitConfigString, '');
  const explicitPayload = JSON.parse(decodeBase64Url(explicitConfigString));
  assert.equal(explicitPayload.backdropImageSize, 'large');
});

test('workspace normalization accepts cinemeta as a poster artwork source', () => {
  const config = normalizeSavedUiConfig({
    settings: {
      posterArtworkSource: 'cinemeta',
      backdropArtworkSource: 'cinemeta',
      logoArtworkSource: 'cinemeta',
    },
  });

  assert.equal(config.settings.posterArtworkSource, 'cinemeta');
  assert.equal(config.settings.backdropArtworkSource, 'cinemeta');
  assert.equal(config.settings.logoArtworkSource, 'cinemeta');
});

test('workspace normalization maps imdb artwork alias to cinemeta', () => {
  const config = normalizeSavedUiConfig({
    settings: {
      posterArtworkSource: 'imdb',
      backdropArtworkSource: 'imdb',
      logoArtworkSource: 'imdb',
    },
  });

  assert.equal(config.settings.posterArtworkSource, 'cinemeta');
  assert.equal(config.settings.backdropArtworkSource, 'cinemeta');
  assert.equal(config.settings.logoArtworkSource, 'cinemeta');
});

test('workspace normalization keeps OMDb poster artwork poster only', () => {
  const config = normalizeSavedUiConfig({
    settings: {
      posterArtworkSource: 'omdb',
      backdropArtworkSource: 'omdb',
      logoArtworkSource: 'omdb',
    },
  });

  assert.equal(config.settings.posterArtworkSource, 'omdb');
  assert.equal(config.settings.backdropArtworkSource, 'tmdb');
  assert.equal(config.settings.logoArtworkSource, 'tmdb');
});

test('workspace normalization maps RPDB order, bar position, and font scale aliases', () => {
  const config = normalizeSavedUiConfig({
    settings: {
      order: 'imdb,tomatoes-critics,metacritic-audience',
      ratingBarPos: 'right-center',
      fontScale: '1.2',
      imageSize: 'verylarge',
    },
  });

  assert.deepEqual(config.settings.posterRatingPreferences, ['imdb', 'tomatoes', 'metacriticuser']);
  assert.deepEqual(config.settings.backdropRatingPreferences, ['imdb', 'tomatoes', 'metacriticuser']);
  assert.deepEqual(config.settings.logoRatingPreferences, ['imdb', 'tomatoes', 'metacriticuser']);
  assert.equal(config.settings.posterRatingsLayout, 'right');
  assert.equal(config.settings.backdropRatingsLayout, 'right-vertical');
  assert.equal(config.settings.posterSideRatingsPosition, 'middle');
  assert.equal(config.settings.backdropSideRatingsPosition, 'middle');
  assert.equal(config.settings.sideRatingsPosition, 'middle');
  assert.equal(config.settings.posterImageSize, '4k');
  assert.equal(config.settings.posterRatingBadgeScale, 120);
  assert.equal(config.settings.backdropRatingBadgeScale, 120);
  assert.equal(config.settings.logoRatingBadgeScale, 120);
});

test('workspace normalization keeps poster and backdrop side placement independent', () => {
  const config = normalizeSavedUiConfig({
    settings: {
      posterSideRatingsPosition: 'custom',
      posterSideRatingsOffset: 63,
      backdropSideRatingsPosition: 'bottom',
      backdropSideRatingsOffset: 17,
    },
  });

  assert.equal(config.settings.posterSideRatingsPosition, 'custom');
  assert.equal(config.settings.posterSideRatingsOffset, 63);
  assert.equal(config.settings.backdropSideRatingsPosition, 'bottom');
  assert.equal(config.settings.backdropSideRatingsOffset, 17);
});

test('workspace normalization backfills per-type side placement from legacy shared fields', () => {
  const config = normalizeSavedUiConfig({
    settings: {
      sideRatingsPosition: 'custom',
      sideRatingsOffset: 63,
    },
  });

  assert.equal(config.settings.posterSideRatingsPosition, 'custom');
  assert.equal(config.settings.posterSideRatingsOffset, 63);
  assert.equal(config.settings.backdropSideRatingsPosition, 'custom');
  assert.equal(config.settings.backdropSideRatingsOffset, 63);
  assert.equal(config.settings.sideRatingsPosition, 'custom');
  assert.equal(config.settings.sideRatingsOffset, 63);
});

test('workspace normalization keeps explicit XRDB settings over RPDB aliases', () => {
  const config = normalizeSavedUiConfig({
    settings: {
      ratingBarPos: 'left-top',
      posterRatingsLayout: 'top',
      posterSideRatingsPosition: 'custom',
      posterSideRatingsOffset: 63,
      backdropSideRatingsPosition: 'bottom',
      backdropSideRatingsOffset: 27,
      fontScale: '1.4',
      posterRatingBadgeScale: 106,
    },
  });

  assert.equal(config.settings.posterRatingsLayout, 'top');
  assert.equal(config.settings.posterSideRatingsPosition, 'custom');
  assert.equal(config.settings.posterSideRatingsOffset, 63);
  assert.equal(config.settings.backdropSideRatingsPosition, 'bottom');
  assert.equal(config.settings.backdropSideRatingsOffset, 27);
  assert.equal(config.settings.posterRatingBadgeScale, 106);
  assert.equal(config.settings.backdropRatingBadgeScale, 140);
  assert.equal(config.settings.logoRatingBadgeScale, 140);
});

test('proxy ID normalization canonicalizes MAL aliases for anime image rewrites', () => {
  assert.equal(normalizeXrdbId('mal:456', 'series'), 'mal:456');
  assert.equal(normalizeXrdbId('myanimelist:456', 'series'), 'mal:456');
  assert.equal(normalizeXrdbId('anilist:123:2', 'series'), 'anilist:123:2');
  assert.equal(normalizeXrdbId('tvdb:789:3', 'series'), 'tvdb:789:3');
  assert.equal(normalizeXrdbId('xrdbid:tt0944947:2:1', 'series'), 'xrdbid:tt0944947:2:1');
  assert.equal(normalizeXrdbId('anidb:789', 'series'), 'anidb:789');
  assert.equal(normalizeXrdbId('tt0944947:2', 'series'), 'tt0944947:2');
  assert.equal(normalizeXrdbId('imdb:tt0944947:2', 'series'), 'imdb:tt0944947:2');
  assert.equal(normalizeXrdbId('tmdb:tv:1399:2', 'series'), 'tmdb:tv:1399:2');
  assert.equal(normalizeXrdbId('tmdb:series:1399:2', 'series'), 'tmdb:tv:1399:2');
});

test('AIOMetadata export supports tvdb and xrdbid episode thumbnail patterns', () => {
  const config = buildSampleSettings();

  const tvdbPatterns = buildAiometadataUrlPatterns('https://xrdb.example.com/', config.settings, {
    hideCredentials: true,
    episodeIdMode: 'tvdb',
  });
  const canonPatterns = buildAiometadataUrlPatterns('https://xrdb.example.com/', config.settings, {
    hideCredentials: true,
    episodeIdMode: 'xrdbid',
  });

  assert.equal(
    tvdbPatterns?.episodeThumbnailUrlPattern.startsWith(
      'https://xrdb.example.com/thumbnail/tvdb:{tvdb_id}/S{season}E{episode}.jpg?',
    ),
    true,
  );
  assert.equal(
    canonPatterns?.episodeThumbnailUrlPattern.startsWith(
      'https://xrdb.example.com/thumbnail/xrdbid:{imdb_id}/S{season}E{episode}.jpg?',
    ),
    true,
  );
});

test('episode artwork overrides stay type scoped across config and AIOMetadata exports', () => {
  const config = normalizeSavedUiConfig({
    settings: {
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
      thumbnailEpisodeArtwork: 'series',
      backdropEpisodeArtwork: 'still',
    },
    proxy: {
      manifestUrl: 'https://addon.example.com/manifest.json',
    },
  });

  const configString = buildConfigString('https://xrdb.example.com', config.settings);
  const decodedConfig = JSON.parse(decodeBase64Url(configString));
  assert.equal(decodedConfig.thumbnailEpisodeArtwork, 'series');
  assert.equal(decodedConfig.backdropEpisodeArtwork, 'still');

  const proxyUrl = buildProxyUrl('https://xrdb.example.com', config.proxy, config.settings);
  const encodedConfig = proxyUrl.split('/proxy/')[1]?.replace('/manifest.json', '');
  assert.ok(encodedConfig);
  const decodedProxy = decodeProxyConfig(encodedConfig);
  assert.equal(decodedProxy.thumbnailEpisodeArtwork, 'series');
  assert.equal(decodedProxy.backdropEpisodeArtwork, 'still');

  const patterns = buildAiometadataUrlPatterns('https://xrdb.example.com/', config.settings, {
    hideCredentials: true,
  });

  assert.match(patterns?.backgroundUrlPattern ?? '', /backdropEpisodeArtwork=still/);
  assert.equal((patterns?.backgroundUrlPattern ?? '').includes('thumbnailEpisodeArtwork='), false);
  assert.match(patterns?.episodeThumbnailUrlPattern ?? '', /thumbnailEpisodeArtwork=series/);
  assert.equal((patterns?.episodeThumbnailUrlPattern ?? '').includes('backdropEpisodeArtwork='), false);
  assert.equal((patterns?.posterUrlPattern ?? '').includes('thumbnailEpisodeArtwork='), false);
  assert.equal((patterns?.posterUrlPattern ?? '').includes('backdropEpisodeArtwork='), false);
  assert.equal((patterns?.logoUrlPattern ?? '').includes('thumbnailEpisodeArtwork='), false);
  assert.equal((patterns?.logoUrlPattern ?? '').includes('backdropEpisodeArtwork='), false);
});

test('TMDB ID scope helpers detect explicit and ambiguous forms', () => {
  assert.equal(hasExplicitTmdbMediaTypeInXrdbId('tmdb:movie:603'), true);
  assert.equal(hasExplicitTmdbMediaTypeInXrdbId('tmdb:tv:1399:2'), true);
  assert.equal(hasExplicitTmdbMediaTypeInXrdbId('tmdb:603'), false);

  assert.equal(isAmbiguousTmdbXrdbId('tmdb:603'), true);
  assert.equal(isAmbiguousTmdbXrdbId('tmdb:movie:603'), false);
  assert.equal(isAmbiguousTmdbXrdbId('tmdb:tv:1399'), false);
  assert.equal(isAmbiguousTmdbXrdbId('tt0133093'), false);
});
