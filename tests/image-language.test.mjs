import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildIncludeImageLanguage,
  filterByLanguageWithFallback,
  normalizeImageLanguage,
  pickByLanguageOrNeutral,
  pickByLanguageWithFallback,
} from '../lib/imageLanguage.ts';

test('normalizeImageLanguage normalizes regional English aliases', () => {
  assert.equal(normalizeImageLanguage('en-US'), 'en');
  assert.equal(normalizeImageLanguage('us'), 'en');
  assert.equal(normalizeImageLanguage('fr-BE'), 'fr');
});

test('buildIncludeImageLanguage keeps preferred fallback and null without duplicates', () => {
  assert.equal(buildIncludeImageLanguage('en-US', 'en'), 'en,null');
  assert.equal(buildIncludeImageLanguage('fr', 'en'), 'fr,en,null');
});

test('pickByLanguageWithFallback prefers neutral logos before arbitrary language', () => {
  const logos = [
    { iso_639_1: 'ko', file_path: '/ko.png' },
    { iso_639_1: null, file_path: '/neutral.png' },
    { iso_639_1: 'he', file_path: '/he.png' },
  ];

  const picked = pickByLanguageWithFallback(logos, 'en', 'en');

  assert.equal(picked?.file_path, '/neutral.png');
});

test('pickByLanguageWithFallback still prefers exact requested language first', () => {
  const logos = [
    { iso_639_1: 'he', file_path: '/he.png' },
    { iso_639_1: 'en', file_path: '/en.png' },
    { iso_639_1: null, file_path: '/neutral.png' },
  ];

  const picked = pickByLanguageWithFallback(logos, 'en', 'en');

  assert.equal(picked?.file_path, '/en.png');
});

test('pickByLanguageWithFallback uses explicit fallback language before neutral', () => {
  const logos = [
    { iso_639_1: 'fr', file_path: '/fr.png' },
    { iso_639_1: 'en', file_path: '/en.png' },
    { iso_639_1: null, file_path: '/neutral.png' },
  ];

  const picked = pickByLanguageWithFallback(logos, 'it', 'en');

  assert.equal(picked?.file_path, '/en.png');
});

test('pickByLanguageWithFallback falls back to first item when no language match exists', () => {
  const logos = [
    { iso_639_1: 'ko', file_path: '/ko.png' },
    { iso_639_1: 'he', file_path: '/he.png' },
  ];

  const picked = pickByLanguageWithFallback(logos, 'en', 'en');

  assert.equal(picked?.file_path, '/ko.png');
});

test('pickByLanguageOrNeutral returns neutral entry when preferred and fallback are unavailable', () => {
  const logos = [
    { iso_639_1: 'ko', file_path: '/ko.png' },
    { iso_639_1: null, file_path: '/neutral.png' },
    { iso_639_1: 'he', file_path: '/he.png' },
  ];

  const picked = pickByLanguageOrNeutral(logos, 'en', 'en');

  assert.equal(picked?.file_path, '/neutral.png');
});

test('pickByLanguageOrNeutral returns null when no preferred fallback or neutral exists', () => {
  const logos = [
    { iso_639_1: 'ko', file_path: '/ko.png' },
    { iso_639_1: 'he', file_path: '/he.png' },
  ];

  const picked = pickByLanguageOrNeutral(logos, 'en', 'en');

  assert.equal(picked, null);
});

test('pickByLanguageWithFallback prefers the exact region over an earlier same-language variant', () => {
  const logos = [
    { iso_639_1: 'fr', iso_3166_1: 'CA', file_path: '/fr-ca.png' },
    { iso_639_1: 'fr', iso_3166_1: 'FR', file_path: '/fr-fr.png' },
  ];

  assert.equal(pickByLanguageWithFallback(logos, 'fr-FR', 'en')?.file_path, '/fr-fr.png');
  assert.equal(pickByLanguageWithFallback(logos, 'fr-CA', 'en')?.file_path, '/fr-ca.png');
});

test('pickByLanguageOrNeutral prefers the exact region over an earlier same-language variant', () => {
  const logos = [
    { iso_639_1: 'fr', iso_3166_1: 'CA', file_path: '/fr-ca.png' },
    { iso_639_1: 'fr', iso_3166_1: 'FR', file_path: '/fr-fr.png' },
  ];

  assert.equal(pickByLanguageOrNeutral(logos, 'fr-FR', 'en')?.file_path, '/fr-fr.png');
});

test('region-qualified request still accepts a same-language asset when the region is absent', () => {
  const logos = [
    { iso_639_1: 'fr', iso_3166_1: 'CA', file_path: '/fr-ca.png' },
    { iso_639_1: 'en', iso_3166_1: 'US', file_path: '/en.png' },
  ];

  assert.equal(pickByLanguageWithFallback(logos, 'fr-FR', 'en')?.file_path, '/fr-ca.png');
});

test('region-qualified request prefers a region-neutral variant over a different region', () => {
  const logos = [
    { iso_639_1: 'fr', iso_3166_1: 'CA', file_path: '/fr-ca.png' },
    { iso_639_1: 'fr', iso_3166_1: null, file_path: '/fr-neutral.png' },
  ];

  assert.equal(pickByLanguageWithFallback(logos, 'fr-FR', 'en')?.file_path, '/fr-neutral.png');
});

test('language-only request keeps first same-language match regardless of region', () => {
  const logos = [
    { iso_639_1: 'fr', iso_3166_1: 'CA', file_path: '/fr-ca.png' },
    { iso_639_1: 'fr', iso_3166_1: 'FR', file_path: '/fr-fr.png' },
  ];

  assert.equal(pickByLanguageWithFallback(logos, 'fr', 'en')?.file_path, '/fr-ca.png');
});

test('filterByLanguageWithFallback keeps requested fallback and neutral entries when available', () => {
  const logos = [
    { iso_639_1: 'he', file_path: '/he.png' },
    { iso_639_1: 'en', file_path: '/en.png' },
    { iso_639_1: null, file_path: '/neutral.png' },
  ];

  const filtered = filterByLanguageWithFallback(logos, 'en', 'en');

  assert.deepEqual(
    filtered.map((item) => item.file_path),
    ['/en.png', '/neutral.png'],
  );
});

test('filterByLanguageWithFallback returns original list when no scoped language entries exist', () => {
  const logos = [
    { iso_639_1: 'ko', file_path: '/ko.png' },
    { iso_639_1: 'he', file_path: '/he.png' },
  ];

  const filtered = filterByLanguageWithFallback(logos, 'en', 'en');

  assert.deepEqual(filtered, logos);
});
