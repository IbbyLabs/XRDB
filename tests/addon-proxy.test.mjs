import test from 'node:test';
import assert from 'node:assert/strict';

import { buildXrdbImageUrl, decodeProxyConfig } from '../lib/proxyConfigBridge.ts';
import { encodeRatingProviderAppearanceOverrides } from '../lib/badgeCustomization.ts';
import { buildProxyUrl, normalizeSavedUiConfig } from '../lib/uiConfig.ts';

test('generated proxy manifest carries configurator settings into rewritten logo artwork', () => {
  const providerAppearance = {
    mdblist: {
      accentColor: '#22c55e',
      iconScalePercent: 112,
      stackedWidthPercent: 91,
      stackedSurfaceOpacityPercent: 70,
      stackedLineWidthPercent: 88,
    },
  };
  const uiConfig = normalizeSavedUiConfig({
    settings: {
      xrdbKey: 'proxy-xrdb-key-123',
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
      fanartKey: 'fanart-key-789',
      lang: 'en',
      ratingValueMode: 'normalized',
      logoGenreBadgeMode: 'text',
      logoGenreBadgeStyle: 'plain',
      logoGenreBadgePosition: 'bottomCenter',
      logoGenreBadgeScale: 112,
      logoRatingPreferences: ['mdblist', 'tomatoes', 'letterboxd'],
      logoRatingStyle: 'stacked',
      logoRatingPresentation: 'average',
      logoAggregateRatingSource: 'audience',
      aggregateAccentMode: 'custom',
      aggregateAccentColor: '#22d3ee',
      aggregateCriticsAccentColor: '#f97316',
      aggregateAudienceAccentColor: '#22c55e',
      aggregateAccentBarOffset: -3,
      ratingXOffsetPillGlass: 22,
      ratingYOffsetPillGlass: -8,
      ratingXOffsetSquare: -14,
      ratingYOffsetSquare: 10,
      logoRatingsMax: 3,
      logoBackground: 'dark',
      logoArtworkSource: 'fanart',
      logoRatingBadgeScale: 94,
      ratingProviderAppearanceOverrides: providerAppearance,
    },
    proxy: {
      manifestUrl: 'https://addon.example.com/manifest.json',
    },
  });

  const proxyUrl = buildProxyUrl('https://xrdb.example.com', uiConfig.proxy, uiConfig.settings);
  const encodedConfig = proxyUrl.split('/proxy/')[1]?.replace('/manifest.json', '');

  assert.ok(encodedConfig);

  const decodedProxyConfig = decodeProxyConfig(encodedConfig);
  assert.ok(decodedProxyConfig);
  assert.equal(decodedProxyConfig.xrdbKey, 'proxy-xrdb-key-123');

  const rewrittenLogoUrl = new URL(
    buildXrdbImageUrl({
      reqUrl: new URL(
        `https://proxy.example.net/proxy/${encodedConfig}/meta/series/example.json?logoRatings=myanimelist,anilist&logoRatingsMax=1&logoBackground=transparent&logoRatingStyle=glass&lang=ja`
      ),
      imageType: 'logo',
      xrdbId: 'mal:16498',
      tmdbKey: decodedProxyConfig.tmdbKey,
      mdblistKey: decodedProxyConfig.mdblistKey,
      config: decodedProxyConfig,
    })
  );

  assert.equal(rewrittenLogoUrl.origin, 'https://xrdb.example.com');
  assert.equal(rewrittenLogoUrl.pathname, '/logo/mal%3A16498.jpg');
  assert.equal(rewrittenLogoUrl.searchParams.get('xrdbKey'), 'proxy-xrdb-key-123');
  assert.equal(rewrittenLogoUrl.searchParams.get('tmdbKey'), 'tmdb-key-123');
  assert.equal(rewrittenLogoUrl.searchParams.get('mdblistKey'), 'mdblist-key-456');
  assert.equal(rewrittenLogoUrl.searchParams.get('fanartKey'), 'fanart-key-789');
  assert.equal(rewrittenLogoUrl.searchParams.get('lang'), 'en');
  assert.equal(rewrittenLogoUrl.searchParams.get('ratingValueMode'), 'normalized');
  assert.equal(rewrittenLogoUrl.searchParams.get('logoGenreBadge'), 'text');
  assert.equal(rewrittenLogoUrl.searchParams.get('logoGenreBadgeStyle'), 'plain');
  assert.equal(rewrittenLogoUrl.searchParams.get('logoGenreBadgePosition'), 'bottomCenter');
  assert.equal(rewrittenLogoUrl.searchParams.get('logoGenreBadgeScale'), '112');
  assert.equal(rewrittenLogoUrl.searchParams.get('logoRatings'), 'mdblist,tomatoes,letterboxd');
  assert.equal(rewrittenLogoUrl.searchParams.get('logoRatingsMax'), '3');
  assert.equal(rewrittenLogoUrl.searchParams.get('logoBackground'), 'dark');
  assert.equal(rewrittenLogoUrl.searchParams.get('logoArtworkSource'), 'fanart');
  assert.equal(rewrittenLogoUrl.searchParams.get('logoRatingPresentation'), 'average');
  assert.equal(rewrittenLogoUrl.searchParams.get('logoAggregateRatingSource'), 'audience');
  assert.equal(rewrittenLogoUrl.searchParams.get('aggregateAccentMode'), 'custom');
  assert.equal(rewrittenLogoUrl.searchParams.get('aggregateAccentColor'), '#22d3ee');
  assert.equal(rewrittenLogoUrl.searchParams.get('aggregateCriticsAccentColor'), '#f97316');
  assert.equal(rewrittenLogoUrl.searchParams.get('aggregateAudienceAccentColor'), '#22c55e');
  assert.equal(rewrittenLogoUrl.searchParams.get('aggregateAccentBarOffset'), '-3');
  assert.equal(rewrittenLogoUrl.searchParams.get('ratingXOffsetPillGlass'), '22');
  assert.equal(rewrittenLogoUrl.searchParams.get('ratingYOffsetPillGlass'), '-8');
  assert.equal(rewrittenLogoUrl.searchParams.get('ratingXOffsetSquare'), '-14');
  assert.equal(rewrittenLogoUrl.searchParams.get('ratingYOffsetSquare'), '10');
  assert.equal(rewrittenLogoUrl.searchParams.get('logoRatingBadgeScale'), '94');
  assert.equal(
    rewrittenLogoUrl.searchParams.get('providerAppearance'),
    encodeRatingProviderAppearanceOverrides(providerAppearance),
  );
  assert.equal(rewrittenLogoUrl.searchParams.get('ratingStyle'), 'stacked');
});

test('proxy image rewrites upgrade legacy logo source params to artwork source params', () => {
  const rewrittenLogoUrl = new URL(
    buildXrdbImageUrl({
      reqUrl: new URL(
        'https://proxy.example.net/proxy/example/meta/series/example.json?logoSource=fanart&logoBackground=dark'
      ),
      imageType: 'logo',
      xrdbId: 'tt0386676',
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
      config: {
        url: 'https://addon.example.com/manifest.json',
        tmdbKey: 'tmdb-key-123',
        mdblistKey: 'mdblist-key-456',
      },
    })
  );

  assert.equal(rewrittenLogoUrl.searchParams.get('logoArtworkSource'), 'fanart');
  assert.equal(rewrittenLogoUrl.searchParams.get('logoSource'), null);
});

test('proxy image rewrites carry side rating placement for poster layouts', () => {
  const providerAppearance = {
    trakt: {
      iconUrl: 'https://cdn.example.com/trakt-custom.svg',
      accentColor: '#7c3aed',
      iconScalePercent: 116,
      stackedWidthPercent: 84,
      stackedAccentMode: 'logo',
      stackedLineVisible: false,
    },
  };
  const uiConfig = normalizeSavedUiConfig({
    settings: {
      xrdbKey: 'proxy-xrdb-key-456',
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
      fanartKey: 'fanart-key-789',
      posterImageSize: '4k',
      posterImageText: 'clean',
      posterArtworkSource: 'fanart',
      backdropImageText: 'clean',
      backdropArtworkSource: 'fanart',
      ratingValueMode: 'normalized',
      posterGenreBadgeMode: 'both',
      posterGenreBadgeStyle: 'square',
      posterGenreBadgePosition: 'bottomRight',
      posterGenreBadgeScale: 116,
      posterRatingPreferences: ['imdb', 'trakt', 'metacritic'],
      posterRatingsLayout: 'left-right',
      posterRatingsMax: 3,
      posterQualityBadgePreferences: ['certification', 'hdr'],
      posterQualityBadgesStyle: 'plain',
      posterQualityBadgeScale: 118,
      posterRatingBadgeScale: 111,
      posterEdgeOffset: 22,
      posterSideRatingsPosition: 'custom',
      posterSideRatingsOffset: 68,
      ratingProviderAppearanceOverrides: providerAppearance,
    },
    proxy: {
      manifestUrl: 'https://addon.example.com/manifest.json',
    },
  });

  const proxyUrl = buildProxyUrl('https://xrdb.example.com', uiConfig.proxy, uiConfig.settings);
  const encodedConfig = proxyUrl.split('/proxy/')[1]?.replace('/manifest.json', '');
  assert.ok(encodedConfig);

  const decodedProxyConfig = decodeProxyConfig(encodedConfig);
  assert.ok(decodedProxyConfig);
  assert.equal(decodedProxyConfig.xrdbKey, 'proxy-xrdb-key-456');

  const rewrittenPosterUrl = new URL(
    buildXrdbImageUrl({
      reqUrl: new URL('https://proxy.example.net/proxy/example/meta/movie/example.json'),
      imageType: 'poster',
      xrdbId: 'tt0468569',
      tmdbKey: decodedProxyConfig.tmdbKey,
      mdblistKey: decodedProxyConfig.mdblistKey,
      config: decodedProxyConfig,
    })
  );

  assert.equal(rewrittenPosterUrl.searchParams.get('posterRatings'), 'imdb,trakt,metacritic');
  assert.equal(rewrittenPosterUrl.searchParams.get('xrdbKey'), 'proxy-xrdb-key-456');
  assert.equal(rewrittenPosterUrl.searchParams.get('fanartKey'), 'fanart-key-789');
  assert.equal(rewrittenPosterUrl.searchParams.get('ratingValueMode'), 'normalized');
  assert.equal(rewrittenPosterUrl.searchParams.get('posterGenreBadge'), 'both');
  assert.equal(rewrittenPosterUrl.searchParams.get('posterGenreBadgeStyle'), 'square');
  assert.equal(rewrittenPosterUrl.searchParams.get('posterGenreBadgePosition'), 'bottomRight');
  assert.equal(rewrittenPosterUrl.searchParams.get('posterGenreBadgeScale'), '116');
  assert.equal(rewrittenPosterUrl.searchParams.get('imageText'), 'clean');
  assert.equal(rewrittenPosterUrl.searchParams.get('posterImageSize'), '4k');
  assert.equal(rewrittenPosterUrl.searchParams.get('posterArtworkSource'), 'fanart');
  assert.equal(rewrittenPosterUrl.searchParams.get('posterRatingsLayout'), 'left-right');
  assert.equal(rewrittenPosterUrl.searchParams.get('posterRatingsMax'), '3');
  assert.equal(rewrittenPosterUrl.searchParams.get('posterQualityBadges'), 'certification,hdr');
  assert.equal(rewrittenPosterUrl.searchParams.get('posterQualityBadgesStyle'), 'plain');
  assert.equal(rewrittenPosterUrl.searchParams.get('posterQualityBadgeScale'), '118');
  assert.equal(rewrittenPosterUrl.searchParams.get('posterRatingBadgeScale'), '111');
  assert.equal(rewrittenPosterUrl.searchParams.get('posterEdgeOffset'), '22');
  assert.equal(rewrittenPosterUrl.searchParams.get('posterSideRatingsPosition'), 'custom');
  assert.equal(rewrittenPosterUrl.searchParams.get('posterSideRatingsOffset'), '68');
  assert.equal(rewrittenPosterUrl.searchParams.get('sideRatingsPosition'), null);
  assert.equal(rewrittenPosterUrl.searchParams.get('sideRatingsOffset'), null);
  assert.equal(
    rewrittenPosterUrl.searchParams.get('providerAppearance'),
    encodeRatingProviderAppearanceOverrides(providerAppearance),
  );
});

test('proxy image rewrites can preserve the upstream image as a fallback URL', () => {
  const rewrittenPosterUrl = new URL(
    buildXrdbImageUrl({
      reqUrl: new URL('https://proxy.example.net/proxy/example/meta/movie/example.json'),
      imageType: 'poster',
      xrdbId: 'tt11003218',
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
      fallbackUrl: 'https://images.example.com/posters/tt11003218.jpg',
      config: {
        url: 'https://addon.example.com/manifest.json',
        tmdbKey: 'tmdb-key-123',
        mdblistKey: 'mdblist-key-456',
      },
    })
  );

  assert.equal(
    rewrittenPosterUrl.searchParams.get('fallbackUrl'),
    'https://images.example.com/posters/tt11003218.jpg',
  );
});

test('proxy image rewrites carry artwork source selection for backdrops', () => {
  const uiConfig = normalizeSavedUiConfig({
    settings: {
      xrdbKey: 'proxy-xrdb-key-789',
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
      fanartKey: 'fanart-key-789',
      backdropImageText: 'clean',
      backdropArtworkSource: 'fanart',
      backdropGenreBadgeMode: 'text',
      backdropGenreBadgeStyle: 'plain',
      backdropGenreBadgePosition: 'bottomLeft',
      backdropGenreBadgeScale: 122,
      backdropRatingPreferences: ['imdb'],
      backdropRatingsLayout: 'right-vertical',
      backdropRatingsMax: 2,
      backdropSideRatingsPosition: 'custom',
      backdropSideRatingsOffset: 41,
      backdropQualityBadgePreferences: ['4k', 'dolbyatmos'],
      backdropQualityBadgesStyle: 'media',
      backdropQualityBadgeScale: 106,
      backdropRatingBadgeScale: 109,
    },
    proxy: {
      manifestUrl: 'https://addon.example.com/manifest.json',
    },
  });

  const proxyUrl = buildProxyUrl('https://xrdb.example.com', uiConfig.proxy, uiConfig.settings);
  const encodedConfig = proxyUrl.split('/proxy/')[1]?.replace('/manifest.json', '');
  assert.ok(encodedConfig);

  const decodedProxyConfig = decodeProxyConfig(encodedConfig);
  assert.ok(decodedProxyConfig);
  assert.equal(decodedProxyConfig.xrdbKey, 'proxy-xrdb-key-789');

  const rewrittenBackdropUrl = new URL(
    buildXrdbImageUrl({
      reqUrl: new URL('https://proxy.example.net/proxy/example/meta/series/example.json'),
      imageType: 'backdrop',
      xrdbId: 'tt0386676',
      tmdbKey: decodedProxyConfig.tmdbKey,
      mdblistKey: decodedProxyConfig.mdblistKey,
      config: decodedProxyConfig,
    })
  );

  assert.equal(rewrittenBackdropUrl.searchParams.get('imageText'), 'clean');
  assert.equal(rewrittenBackdropUrl.searchParams.get('xrdbKey'), 'proxy-xrdb-key-789');
  assert.equal(rewrittenBackdropUrl.searchParams.get('fanartKey'), 'fanart-key-789');
  assert.equal(rewrittenBackdropUrl.searchParams.get('backdropGenreBadge'), 'text');
  assert.equal(rewrittenBackdropUrl.searchParams.get('backdropGenreBadgeStyle'), 'plain');
  assert.equal(rewrittenBackdropUrl.searchParams.get('backdropGenreBadgePosition'), 'bottomLeft');
  assert.equal(rewrittenBackdropUrl.searchParams.get('backdropGenreBadgeScale'), '122');
  assert.equal(rewrittenBackdropUrl.searchParams.get('backdropArtworkSource'), 'fanart');
  assert.equal(rewrittenBackdropUrl.searchParams.get('backdropRatingsLayout'), 'right-vertical');
  assert.equal(rewrittenBackdropUrl.searchParams.get('backdropRatingsMax'), '2');
  assert.equal(rewrittenBackdropUrl.searchParams.get('backdropSideRatingsPosition'), 'custom');
  assert.equal(rewrittenBackdropUrl.searchParams.get('backdropSideRatingsOffset'), '41');
  assert.equal(rewrittenBackdropUrl.searchParams.get('sideRatingsPosition'), null);
  assert.equal(rewrittenBackdropUrl.searchParams.get('sideRatingsOffset'), null);
  assert.equal(rewrittenBackdropUrl.searchParams.get('backdropQualityBadges'), '4k,dolbyatmos');
  assert.equal(rewrittenBackdropUrl.searchParams.get('backdropQualityBadgesStyle'), 'media');
  assert.equal(rewrittenBackdropUrl.searchParams.get('backdropQualityBadgeScale'), '106');
  assert.equal(rewrittenBackdropUrl.searchParams.get('backdropRatingBadgeScale'), '109');
});

test('proxy image rewrites accept plural rating style aliases for backdrops', () => {
  const rewrittenBackdropUrl = new URL(
    buildXrdbImageUrl({
      reqUrl: new URL(
        'https://proxy.example.net/proxy/example/meta/series/example.json?backdropRatingsStyle=square'
      ),
      imageType: 'backdrop',
      xrdbId: 'tt0133093',
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
      config: {
        url: 'https://addon.example.com/manifest.json',
        tmdbKey: 'tmdb-key-123',
        mdblistKey: 'mdblist-key-456',
      },
    }),
  );

  assert.equal(rewrittenBackdropUrl.searchParams.get('ratingStyle'), 'square');
});

test('proxy image rewrites preserve cinemeta as a poster artwork source', () => {
  const uiConfig = normalizeSavedUiConfig({
    settings: {
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
      posterImageText: 'clean',
      posterArtworkSource: 'cinemeta',
      posterRatingPreferences: ['imdb'],
    },
    proxy: {
      manifestUrl: 'https://addon.example.com/manifest.json',
    },
  });

  const proxyUrl = buildProxyUrl('https://xrdb.example.com', uiConfig.proxy, uiConfig.settings);
  const encodedConfig = proxyUrl.split('/proxy/')[1]?.replace('/manifest.json', '');
  assert.ok(encodedConfig);

  const decodedProxyConfig = decodeProxyConfig(encodedConfig);
  assert.ok(decodedProxyConfig);

  const rewrittenPosterUrl = new URL(
    buildXrdbImageUrl({
      reqUrl: new URL('https://proxy.example.net/proxy/example/meta/movie/example.json'),
      imageType: 'poster',
      xrdbId: 'tt0133093',
      tmdbKey: decodedProxyConfig.tmdbKey,
      mdblistKey: decodedProxyConfig.mdblistKey,
      config: decodedProxyConfig,
    }),
  );

  assert.equal(rewrittenPosterUrl.searchParams.get('posterArtworkSource'), 'cinemeta');
});

test('proxy image rewrites preserve OMDb as a poster artwork source', () => {
  const uiConfig = normalizeSavedUiConfig({
    settings: {
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
      posterImageText: 'clean',
      posterArtworkSource: 'omdb',
      posterRatingPreferences: ['imdb'],
    },
    proxy: {
      manifestUrl: 'https://addon.example.com/manifest.json',
    },
  });

  const proxyUrl = buildProxyUrl('https://xrdb.example.com', uiConfig.proxy, uiConfig.settings);
  const encodedConfig = proxyUrl.split('/proxy/')[1]?.replace('/manifest.json', '');
  assert.ok(encodedConfig);

  const decodedProxyConfig = decodeProxyConfig(encodedConfig);
  assert.ok(decodedProxyConfig);

  const rewrittenPosterUrl = new URL(
    buildXrdbImageUrl({
      reqUrl: new URL('https://proxy.example.net/proxy/example/meta/movie/example.json'),
      imageType: 'poster',
      xrdbId: 'tt0133093',
      tmdbKey: decodedProxyConfig.tmdbKey,
      mdblistKey: decodedProxyConfig.mdblistKey,
      config: decodedProxyConfig,
    }),
  );

  assert.equal(rewrittenPosterUrl.searchParams.get('posterArtworkSource'), 'omdb');
});

test('proxy image rewrites preserve cinemeta as a backdrop artwork source', () => {
  const uiConfig = normalizeSavedUiConfig({
    settings: {
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
      backdropImageText: 'clean',
      backdropArtworkSource: 'cinemeta',
    },
    proxy: {
      manifestUrl: 'https://addon.example.com/manifest.json',
    },
  });

  const proxyUrl = buildProxyUrl('https://xrdb.example.com', uiConfig.proxy, uiConfig.settings);
  const encodedConfig = proxyUrl.split('/proxy/')[1]?.replace('/manifest.json', '');
  assert.ok(encodedConfig);

  const decodedProxyConfig = decodeProxyConfig(encodedConfig);
  assert.ok(decodedProxyConfig);

  const rewrittenBackdropUrl = new URL(
    buildXrdbImageUrl({
      reqUrl: new URL('https://proxy.example.net/proxy/example/meta/series/example.json'),
      imageType: 'backdrop',
      xrdbId: 'tt0944947',
      tmdbKey: decodedProxyConfig.tmdbKey,
      mdblistKey: decodedProxyConfig.mdblistKey,
      config: decodedProxyConfig,
    }),
  );

  assert.equal(rewrittenBackdropUrl.searchParams.get('backdropArtworkSource'), 'cinemeta');
});

test('proxy image rewrites preserve cinemeta as a logo artwork source', () => {
  const uiConfig = normalizeSavedUiConfig({
    settings: {
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
      logoArtworkSource: 'cinemeta',
    },
    proxy: {
      manifestUrl: 'https://addon.example.com/manifest.json',
    },
  });

  const proxyUrl = buildProxyUrl('https://xrdb.example.com', uiConfig.proxy, uiConfig.settings);
  const encodedConfig = proxyUrl.split('/proxy/')[1]?.replace('/manifest.json', '');
  assert.ok(encodedConfig);

  const decodedProxyConfig = decodeProxyConfig(encodedConfig);
  assert.ok(decodedProxyConfig);

  const rewrittenLogoUrl = new URL(
    buildXrdbImageUrl({
      reqUrl: new URL('https://proxy.example.net/proxy/example/meta/series/example.json'),
      imageType: 'logo',
      xrdbId: 'tt0944947',
      tmdbKey: decodedProxyConfig.tmdbKey,
      mdblistKey: decodedProxyConfig.mdblistKey,
      config: decodedProxyConfig,
    }),
  );

  assert.equal(rewrittenLogoUrl.searchParams.get('logoArtworkSource'), 'cinemeta');
});

test('proxy image rewrites upgrade legacy clean source params to artwork source params', () => {
  const rewrittenPosterUrl = new URL(
    buildXrdbImageUrl({
      reqUrl: new URL(
        'https://proxy.example.net/proxy/example/meta/movie/example.json?imageText=alternative&posterCleanSource=fanart'
      ),
      imageType: 'poster',
      xrdbId: 'tt0133093',
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
      config: {
        url: 'https://addon.example.com/manifest.json',
        tmdbKey: 'tmdb-key-123',
        mdblistKey: 'mdblist-key-456',
      },
    })
  );

  assert.equal(rewrittenPosterUrl.searchParams.get('posterArtworkSource'), 'fanart');
  assert.equal(rewrittenPosterUrl.searchParams.get('posterCleanSource'), null);
});

test('proxy image rewrites pass RPDB compatibility query aliases through to XRDB', () => {
  const rewrittenPosterUrl = new URL(
    buildXrdbImageUrl({
      reqUrl: new URL(
        'https://proxy.example.net/proxy/example/meta/movie/example.json?order=imdb,tomatoes-critics,metacritic-audience&ratingBarPos=right-top&fontScale=1.2&imageSize=verylarge&textless=true&posterType=textless-order'
      ),
      imageType: 'poster',
      xrdbId: 'tt0133093',
      tmdbKey: 'tmdb-key-123',
      mdblistKey: 'mdblist-key-456',
      config: {
        url: 'https://addon.example.com/manifest.json',
        tmdbKey: 'tmdb-key-123',
        mdblistKey: 'mdblist-key-456',
      },
    }),
  );

  assert.equal(
    rewrittenPosterUrl.searchParams.get('order'),
    'imdb,tomatoes-critics,metacritic-audience',
  );
  assert.equal(rewrittenPosterUrl.searchParams.get('ratingBarPos'), 'right-top');
  assert.equal(rewrittenPosterUrl.searchParams.get('fontScale'), '1.2');
  assert.equal(rewrittenPosterUrl.searchParams.get('imageSize'), 'verylarge');
  assert.equal(rewrittenPosterUrl.searchParams.get('textless'), 'true');
  assert.equal(rewrittenPosterUrl.searchParams.get('posterType'), 'textless-order');
});
