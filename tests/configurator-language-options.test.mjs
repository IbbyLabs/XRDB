import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { buildTmdbSupportedLanguageOptions } from '../lib/configuratorLanguageOptions.ts';

test('configurator language options expand regional TMDB locales into readable labels', () => {
  const options = buildTmdbSupportedLanguageOptions({
    languages: [
      { iso_639_1: 'en', english_name: 'English', name: 'English' },
      { iso_639_1: 'it', english_name: 'Italian', name: 'Italiano' },
      { iso_639_1: 'es', english_name: 'Spanish', name: 'Español' },
    ],
    primaryTranslations: ['en-US', 'en-GB', 'it-IT', 'es-ES', 'es-MX'],
  });

  assert.equal(options.find((entry) => entry.code === 'en-US')?.label, 'English (United States)');
  assert.equal(options.find((entry) => entry.code === 'en-GB')?.label, 'English (United Kingdom)');
  assert.match(options.find((entry) => entry.code === 'es-ES')?.label || '', /^Español \(.+\)$/);
  assert.match(options.find((entry) => entry.code === 'it-IT')?.label || '', /^Italiano \(.+\)$/);
  assert.match(options.find((entry) => entry.code === 'es-MX')?.label || '', /^Español \(.+\)$/);
  assert.deepEqual(options.find((entry) => entry.code === 'en'), {
    code: 'en',
    flag: '🌐',
    label: 'English',
  });
});

test('language selector renders localized labels without appending locale codes', () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'components/configurator-basics.tsx'),
    'utf8',
  );
  assert.match(source, /\{activeOption\.flag\}/);
  assert.match(source, /\{activeOption\.label\}/);
  assert.match(source, /\{option\.flag\}/);
  assert.match(source, /\{option\.label\}/);
  assert.doesNotMatch(source, /\{option\.label\} \(\{option\.code\}\)/);
  assert.doesNotMatch(source, /\{activeOption\.label\} \(\{activeOption\.code\}\)/);
});

test('language selector loads options through the server route instead of direct TMDB client fetches', () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'lib/useConfiguratorPageChrome.ts'),
    'utf8',
  );

  assert.match(source, /new URL\('\/api\/configurator-language-options', window\.location\.origin\)/);
  assert.match(source, /fetch\(languageOptionsUrl\.toString\(\)/);
  assert.doesNotMatch(source, /api\.themoviedb\.org\/3\/configuration\/languages/);
  assert.doesNotMatch(source, /api\.themoviedb\.org\/3\/configuration\/primary_translations/);
});

test('language selector reloads through the server route without forwarding personal TMDB keys in the browser URL', () => {
  const hookSource = fs.readFileSync(
    path.resolve(process.cwd(), 'lib/useConfiguratorPageChrome.ts'),
    'utf8',
  );
  const routeSource = fs.readFileSync(
    path.resolve(process.cwd(), 'app/api/configurator-language-options/route.ts'),
    'utf8',
  );

  assert.doesNotMatch(hookSource, /searchParams\.set\('tmdbKey',/);
  assert.match(routeSource, /readConfiguratorProviderCredentialSession/);
  assert.match(routeSource, /buildTmdbConfigurationUrl\('configuration\/languages', requestTmdbKey\)/);
});

test('language selector dropdown anchors to the trigger right edge to avoid viewport overflow', () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'components/configurator-basics.tsx'),
    'utf8',
  );

  assert.match(source, /absolute right-0 top-full z-30/);
  assert.doesNotMatch(source, /absolute left-0 top-full z-30/);
});
