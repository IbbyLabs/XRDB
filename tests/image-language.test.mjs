import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildIncludeImageLanguage,
  filterByLanguageWithFallback,
  normalizeImageLanguage,
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
