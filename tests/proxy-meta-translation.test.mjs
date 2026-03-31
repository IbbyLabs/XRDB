import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyTranslatedTextFields,
  resolveAnimeTextFallback,
  resolveTmdbTranslationFieldAvailability,
  resolveTmdbTranslationTarget,
} from '../lib/proxyMetaTranslation.ts';

test('anime metadata translation falls back through MAL reverse mapping', async () => {
  const tmdbUrls = [];
  const mappingUrls = [];

  const result = await resolveTmdbTranslationTarget({
    xrdbId: 'myanimelist:1',
    metaType: 'series',
    tmdbKey: 'tmdb-key-123',
    lang: 'fr',
    fetchTmdbJson: async (url) => {
      tmdbUrls.push(url);
      if (url.includes('/tv/30991')) {
        return {
          name: 'Cowboy Bebop',
          overview: 'French overview',
        };
      }
      return null;
    },
    fetchAnimeMappingJson: async (url) => {
      mappingUrls.push(url);
      return {
        ok: true,
        requested: {
          provider: 'mal',
          externalId: '1',
        },
        kitsu: {
          subtype: 'TV',
        },
        mappings: {
          ids: {
            tmdb: '30991',
          },
        },
      };
    },
  });

  assert.deepEqual(result, {
    id: 30991,
    type: 'tv',
    details: {
      name: 'Cowboy Bebop',
      overview: 'French overview',
    },
  });
  assert.deepEqual(mappingUrls, ['https://animemapping.stremio.dpdns.org/mal/1']);
  assert.equal(tmdbUrls.length, 1);
  assert.match(tmdbUrls[0], /\/tv\/30991\?/);
});

test('direct IMDb translation does not invoke anime reverse mapping', async () => {
  let animeMappingCalls = 0;
  const tmdbUrls = [];

  const result = await resolveTmdbTranslationTarget({
    xrdbId: 'tt0213338',
    metaType: 'series',
    tmdbKey: 'tmdb-key-123',
    lang: 'fr',
    fetchTmdbJson: async (url) => {
      tmdbUrls.push(url);
      if (url.includes('/find/tt0213338')) {
        return {
          movie_results: [],
          tv_results: [{ id: 30991 }],
        };
      }
      if (url.includes('/tv/30991')) {
        return {
          name: 'Cowboy Bebop',
          overview: 'French overview',
        };
      }
      return null;
    },
    fetchAnimeMappingJson: async () => {
      animeMappingCalls += 1;
      return null;
    },
  });

  assert.equal(animeMappingCalls, 0);
  assert.deepEqual(result, {
    id: 30991,
    type: 'tv',
    details: {
      name: 'Cowboy Bebop',
      overview: 'French overview',
    },
  });
  assert.equal(tmdbUrls.length, 2);
  assert.match(tmdbUrls[0], /\/find\/tt0213338\?/);
  assert.match(tmdbUrls[1], /\/tv\/30991\?/);
});

test('anime mapping translation falls back to the alternate TMDB media type when needed', async () => {
  const tmdbUrls = [];

  const result = await resolveTmdbTranslationTarget({
    xrdbId: 'anilist:16498',
    metaType: 'series',
    tmdbKey: 'tmdb-key-123',
    lang: 'fr',
    fetchTmdbJson: async (url) => {
      tmdbUrls.push(url);
      if (url.includes('/tv/1429')) {
        return null;
      }
      if (url.includes('/movie/1429')) {
        return {
          title: 'Spirited Away',
          overview: 'French overview',
        };
      }
      return null;
    },
    fetchAnimeMappingJson: async () => ({
      ok: true,
      kitsu: {
        subtype: 'movie',
      },
      mappings: {
        ids: {
          tmdb: '1429',
        },
      },
    }),
  });

  assert.deepEqual(result, {
    id: 1429,
    type: 'movie',
    details: {
      title: 'Spirited Away',
      overview: 'French overview',
    },
  });
  assert.equal(tmdbUrls.length, 2);
  assert.match(tmdbUrls[0], /\/tv\/1429\?/);
  assert.match(tmdbUrls[1], /\/movie\/1429\?/);
});

test('TMDB translation availability requires an exact requested locale match when a region is present', async () => {
  const availability = await resolveTmdbTranslationFieldAvailability({
    tmdbId: 30991,
    type: 'tv',
    tmdbKey: 'tmdb-key-123',
    lang: 'pt-BR',
    fetchTmdbJson: async () => ({
      translations: [
        {
          iso_639_1: 'pt',
          iso_3166_1: 'PT',
          data: {
            name: 'Cowboy Bebop',
            overview: 'Resumo europeu',
          },
        },
      ],
    }),
  });

  assert.deepEqual(availability, {
    title: false,
    overview: false,
  });
});

test('anime text fallback prefers localized anime-native titles and Kitsu overview text', async () => {
  const fallback = await resolveAnimeTextFallback({
    xrdbId: 'mal:1',
    lang: 'ja',
    fetchAnimeMappingJson: async () => ({
      ok: true,
      requested: {
        resolvedKitsuId: '1',
      },
      kitsu: {
        canonicalTitle: 'Cowboy Bebop',
        titles: {
          en: 'Cowboy Bebop',
          ja_jp: 'カウボーイビバップ',
        },
      },
      mappings: {
        ids: {
          anilist: '1',
        },
      },
    }),
    fetchKitsuJson: async () => ({
      data: {
        attributes: {
          canonicalTitle: 'Cowboy Bebop',
          titles: {
            en: 'Cowboy Bebop',
            ja_jp: 'カウボーイビバップ',
          },
          synopsis: 'Space bounty hunters roam the galaxy.',
        },
      },
    }),
    fetchAniListMediaJson: async () => ({
      data: {
        Media: {
          title: {
            english: 'Cowboy Bebop',
            native: 'カウボーイビバップ',
            romaji: 'Cowboy Bebop',
            userPreferred: 'Cowboy Bebop',
          },
          description: 'AniList description',
        },
      },
    }),
  });

  assert.deepEqual(fallback, {
    title: {
      value: 'カウボーイビバップ',
      source: 'kitsu',
      exactRequestedLanguage: true,
    },
    overview: {
      value: 'Space bounty hunters roam the galaxy.',
      source: 'kitsu',
      exactRequestedLanguage: false,
    },
  });
});

test('fill-missing mode preserves meaningful source title and overview text', () => {
  const meta = {
    name: 'Cowboy Bebop',
    description: 'Existing richer overview',
  };

  const debug = applyTranslatedTextFields(meta, {
    mode: 'fill-missing',
    tmdbTitle: 'Titre traduit',
    tmdbOverview: 'Resume traduit',
  });

  assert.deepEqual(meta, {
    name: 'Cowboy Bebop',
    description: 'Existing richer overview',
  });
  assert.equal(debug.title.source, 'source');
  assert.equal(debug.overview.source, 'source');
});

test('fill-missing mode replaces placeholder and blank fields in place', () => {
  const meta = {
    title: 'N/A',
    overview: '  ',
  };

  applyTranslatedTextFields(meta, {
    mode: 'fill-missing',
    tmdbTitle: 'Titre traduit',
    tmdbOverview: 'Resume traduit',
  });

  assert.deepEqual(meta, {
    title: 'Titre traduit',
    overview: 'Resume traduit',
  });
});

test('prefer-source mode keeps non-empty placeholder text untouched', () => {
  const meta = {
    title: 'N/A',
    overview: 'unknown',
  };

  applyTranslatedTextFields(meta, {
    mode: 'prefer-source',
    tmdbTitle: 'Titre traduit',
    tmdbOverview: 'Resume traduit',
  });

  assert.deepEqual(meta, {
    title: 'N/A',
    overview: 'unknown',
  });
});

test('prefer-requested-language mode replaces meaningful source text when TMDB has an exact translation', () => {
  const meta = {
    name: 'Cowboy Bebop',
    description: 'Existing English overview',
  };

  applyTranslatedTextFields(meta, {
    mode: 'prefer-requested-language',
    tmdbTitle: 'Cowboy Bebop FR',
    tmdbOverview: 'Resume FR',
    tmdbTitleExactRequestedLanguage: true,
    tmdbOverviewExactRequestedLanguage: true,
  });

  assert.deepEqual(meta, {
    name: 'Cowboy Bebop FR',
    description: 'Resume FR',
  });
});

test('prefer-requested-language mode can use an exact anime-native title when TMDB only has a fallback language', () => {
  const meta = {
    name: '',
    description: '',
  };

  applyTranslatedTextFields(meta, {
    mode: 'prefer-requested-language',
    tmdbTitle: 'Cowboy Bebop',
    tmdbOverview: 'English overview',
    tmdbTitleExactRequestedLanguage: false,
    tmdbOverviewExactRequestedLanguage: false,
    animeTitle: 'カウボーイビバップ',
    animeOverview: 'Anime fallback overview',
    animeTitleSource: 'kitsu',
    animeOverviewSource: 'kitsu',
    animeTitleExactRequestedLanguage: true,
    animeOverviewExactRequestedLanguage: false,
  });

  assert.deepEqual(meta, {
    name: 'カウボーイビバップ',
    description: 'English overview',
  });
});

test('seeded random metadata cases follow the documented merge rules', () => {
  let seed = 0x5eed1234;
  const nextInt = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed;
  };
  const pick = (values) => values[nextInt() % values.length];

  const statuses = ['meaningful', 'placeholder', 'blank', 'missing'];
  const candidateStatuses = ['meaningful', 'blank'];
  const buildExistingValue = (label, status) => {
    if (status === 'meaningful') return `${label} existing ${nextInt().toString(16)}`;
    if (status === 'placeholder') return pick(['N/A', 'unknown', 'tbd']);
    if (status === 'blank') return pick(['', '   ']);
    return undefined;
  };
  const buildCandidateValue = (label, status) =>
    status === 'meaningful' ? `${label} candidate ${nextInt().toString(16)}` : '';

  const resolveExpected = ({
    mode,
    existingValue,
    tmdbValue,
    tmdbExact,
    animeValue,
    animeExact,
  }) => {
    const hasExistingNonEmpty = typeof existingValue === 'string' && existingValue.trim().length > 0;
    const hasExistingMeaningful =
      hasExistingNonEmpty && !['n/a', 'unknown', 'tbd'].includes(existingValue.trim().toLowerCase());
    const hasTmdb = typeof tmdbValue === 'string' && tmdbValue.trim().length > 0;
    const hasAnime = typeof animeValue === 'string' && animeValue.trim().length > 0;

    if (mode === 'prefer-tmdb' && hasTmdb) return tmdbValue;
    if (mode === 'prefer-requested-language' && hasTmdb && tmdbExact) return tmdbValue;
    if (mode === 'prefer-source' ? hasExistingNonEmpty : hasExistingMeaningful) return existingValue;
    if (mode === 'prefer-requested-language' && hasAnime && animeExact) return animeValue;
    if (hasTmdb) return tmdbValue;
    if (hasAnime) return animeValue;
    if (hasExistingNonEmpty) return existingValue;
    return existingValue;
  };

  const modes = ['fill-missing', 'prefer-source', 'prefer-requested-language', 'prefer-tmdb'];
  for (let index = 0; index < 120; index += 1) {
    const mode = pick(modes);
    const titleStatus = pick(statuses);
    const overviewStatus = pick(statuses);
    const tmdbTitleStatus = pick(candidateStatuses);
    const tmdbOverviewStatus = pick(candidateStatuses);
    const animeTitleStatus = pick(candidateStatuses);
    const animeOverviewStatus = pick(candidateStatuses);
    const meta = {};
    const titleValue = buildExistingValue('title', titleStatus);
    const overviewValue = buildExistingValue('overview', overviewStatus);
    if (titleValue !== undefined) {
      meta[index % 2 === 0 ? 'name' : 'title'] = titleValue;
    }
    if (overviewValue !== undefined) {
      meta[index % 2 === 0 ? 'description' : 'overview'] = overviewValue;
    }

    const tmdbTitle = buildCandidateValue('tmdb title', tmdbTitleStatus);
    const tmdbOverview = buildCandidateValue('tmdb overview', tmdbOverviewStatus);
    const animeTitle = buildCandidateValue('anime title', animeTitleStatus);
    const animeOverview = buildCandidateValue('anime overview', animeOverviewStatus);
    const tmdbTitleExact = Boolean(nextInt() % 2);
    const tmdbOverviewExact = Boolean(nextInt() % 2);
    const animeTitleExact = Boolean(nextInt() % 2);
    const animeOverviewExact = Boolean(nextInt() % 2);

    applyTranslatedTextFields(meta, {
      mode,
      tmdbTitle,
      tmdbOverview,
      tmdbTitleExactRequestedLanguage: tmdbTitleExact,
      tmdbOverviewExactRequestedLanguage: tmdbOverviewExact,
      animeTitle,
      animeOverview,
      animeTitleSource: 'kitsu',
      animeOverviewSource: 'anilist',
      animeTitleExactRequestedLanguage: animeTitleExact,
      animeOverviewExactRequestedLanguage: animeOverviewExact,
    });

    const titleKey = 'name' in meta ? 'name' : 'title';
    const overviewKey = 'description' in meta ? 'description' : 'overview';
    assert.equal(
      meta[titleKey],
      resolveExpected({
        mode,
        existingValue: titleValue,
        tmdbValue: tmdbTitle,
        tmdbExact: tmdbTitleExact,
        animeValue: animeTitle,
        animeExact: animeTitleExact,
      }),
      `title mismatch for mode=${mode} case=${index}`,
    );
    assert.equal(
      meta[overviewKey],
      resolveExpected({
        mode,
        existingValue: overviewValue,
        tmdbValue: tmdbOverview,
        tmdbExact: tmdbOverviewExact,
        animeValue: animeOverview,
        animeExact: animeOverviewExact,
      }),
      `overview mismatch for mode=${mode} case=${index}`,
    );
  }
});
