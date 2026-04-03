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
  assert.equal(options.find((entry) => entry.code === 'en'), undefined);
});

test('language selector renders localized labels without appending locale codes', () => {
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'components/configurator-basics.tsx'),
    'utf8',
  );
  assert.match(source, /\{language\.flag\} \{language\.label\}/);
  assert.doesNotMatch(source, /\{language\.label\} \(\{language\.code\}\)/);
});
