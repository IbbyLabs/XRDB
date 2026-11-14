import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { matchLang, matchPosterLang, isUiLang, UI_LANGS, RTL_LANGS } from '../../lib/i18n.ts';
import { keepsTokens } from '../../scripts/translate-i18n.mjs';

const POSTER_LANGS = [...readFileSync(new URL('../../components/configurator-types.ts', import.meta.url), 'utf8')
  .match(/export const LANG_OPTIONS[\s\S]*?\n\];/)[0].matchAll(/id: '([a-z]{2})'/g)].map((m) => m[1]);

test('the browser language is matched by its base subtag', () => {
  assert.equal(matchLang(['en-GB']), 'en');
  assert.equal(matchLang(['de-AT', 'en']), 'de');
  assert.equal(matchLang(['pt-BR']), 'pt');
  assert.equal(matchLang(['zh-CN']), 'zh');
});

test("the poster default keeps the browser's country for region-preferring artwork", () => {
  assert.equal(matchPosterLang(['pt-BR']), 'pt-BR');
  assert.equal(matchPosterLang(['es-mx']), 'es-MX');
  assert.equal(matchPosterLang(['en-GB']), 'en-GB');
  assert.equal(matchPosterLang(['zh-Hant-TW']), 'zh-TW');
  assert.equal(matchPosterLang(['de']), 'de');
  assert.equal(matchPosterLang(['nb-NO']), 'no-NO');
  assert.equal(matchPosterLang(['sw-KE', 'xx']), 'en');
  assert.equal(matchPosterLang([]), 'en');
});

test('old and regional codes map to the supported language', () => {
  assert.equal(matchLang(['nb-NO']), 'no');
  assert.equal(matchLang(['iw']), 'he');
  assert.equal(matchLang(['in-ID']), 'id');
});

test('the first supported language in the list wins, else English', () => {
  assert.equal(matchLang(['xx', 'fr-CA', 'de']), 'fr');
  assert.equal(matchLang(['xx', 'yy']), 'en');
  assert.equal(matchLang([]), 'en');
  assert.equal(matchLang(undefined), 'en');
});

test('every interface language is a poster language a person can pick', () => {
  assert.ok(POSTER_LANGS.length > 20);
  for (const { id } of UI_LANGS) assert.ok(POSTER_LANGS.includes(id.split('-')[0]), `${id} is not a poster language`);
});

test('Taiwan, Hong Kong, Macau and Traditional script get Traditional Chinese, other Chinese gets Simplified', () => {
  for (const tag of ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-TW', 'zh_TW']) assert.equal(matchLang([tag]), 'zh-Hant', tag);
  for (const tag of ['zh', 'zh-CN', 'zh-SG', 'zh-Hans', 'zh-Hans-TW']) assert.equal(matchLang([tag]), 'zh', tag);
  assert.ok(isUiLang('zh-Hant'));
});

test('only listed languages are accepted from storage', () => {
  assert.ok(isUiLang('ja'));
  assert.ok(!isUiLang('xx'));
  assert.ok(!isUiLang(null));
});

test('Arabic, Hebrew and Persian are right to left', () => {
  assert.deepEqual([...RTL_LANGS].sort(), ['ar', 'fa', 'he']);
  for (const id of RTL_LANGS) assert.ok(UI_LANGS.some((l) => l.id === id));
});

test('a translation must keep every placeholder and tag', () => {
  assert.ok(keepsTokens('Open {name}', 'Öffne {name}'));
  assert.ok(keepsTokens('<b>Find</b> a title', '<b>Finde</b> einen Titel'));
  assert.ok(!keepsTokens('Open {name}', 'Öffne {nom}'));
  assert.ok(!keepsTokens('<b>Find</b> a title', 'Finde einen Titel'));
});

test('every shipped dictionary only holds strings the app uses, with their tokens intact', () => {
  const strings = new Set(JSON.parse(readFileSync(new URL('../../lib/i18n-strings.json', import.meta.url), 'utf8')));
  const dir = new URL('../../public/i18n/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    assert.ok(isUiLang(file.replace('.json', '')), `${file} is not a listed language`);
    const dict = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
    for (const [source, translated] of Object.entries(dict)) {
      assert.ok(strings.has(source), `${file} has an unused string: ${source}`);
      assert.ok(keepsTokens(source, translated), `${file} broke the tokens in: ${source}`);
    }
  }
});
