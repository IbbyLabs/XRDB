#!/usr/bin/env node
// Machine-translates lib/i18n-strings.json into public/i18n/<lang>.json, keeping existing entries.
//   OPENAI_API_KEY=... node scripts/translate-i18n.mjs [lang ...]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'public/i18n');
const MODEL = process.env.I18N_MODEL || 'gpt-4.1-mini';
const BATCH = 120;

const NAMES = {
  ar: 'Arabic', bg: 'Bulgarian', cs: 'Czech', da: 'Danish', de: 'German', el: 'Greek', es: 'Spanish', fa: 'Persian', fi: 'Finnish',
  fr: 'French', he: 'Hebrew', hi: 'Hindi', hu: 'Hungarian', id: 'Indonesian', it: 'Italian', ja: 'Japanese', ko: 'Korean', nl: 'Dutch',
  no: 'Norwegian Bokmål', pl: 'Polish', pt: 'Portuguese', ro: 'Romanian', ru: 'Russian', sv: 'Swedish', ta: 'Tamil', te: 'Telugu',
  th: 'Thai', tr: 'Turkish', uk: 'Ukrainian', vi: 'Vietnamese', zh: 'Simplified Chinese',
};

const log = (level, msg, fields = {}) => console.log(JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields }));

/** Placeholders and inline tags a translation must carry over unchanged. */
export function tokens(text) {
  return [...String(text).matchAll(/\{\w+\}|<\/?\w+>/g)].map((m) => m[0]).sort();
}

export function keepsTokens(source, translated) {
  const a = tokens(source);
  const b = tokens(translated);
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

function prompt(lang) {
  return [
    `Translate user-interface strings from English into ${NAMES[lang]} for XRDB, a web app that configures movie and TV poster images (ratings badges, posters, backdrops, logos).`,
    'Return JSON only: an object mapping each given index (as a string) to its translation.',
    'Keep every {placeholder} and every <tag>...</tag> exactly as written, untranslated, with the text inside tags translated.',
    'Keep product and service names as written: XRDB, TMDB, IMDb, Trakt, Letterboxd, Rotten Tomatoes, Metacritic, MyAnimeList, AniList, Nuvio, Stremio, Fanart.tv, OMDb, Cinemeta, Discord, GitHub, Ko-fi, IbbyLabs, Dolby Vision, HDR, 4K, JPEG, PNG, URL, API.',
    'Use short, natural UI wording in the register people expect from apps in that language. Keep punctuation style suited to the language. Do not add explanations.',
  ].join('\n');
}

async function translateBatch(lang, items, key) {
  const input = Object.fromEntries(items.map((text, i) => [String(i), text]));
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, temperature: 0, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: prompt(lang) }, { role: 'user', content: JSON.stringify(input) }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  return JSON.parse(body.choices?.[0]?.message?.content || '{}');
}

async function translateLang(lang, strings, key) {
  const file = join(OUT, `${lang}.json`);
  const existing = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const todo = strings.filter((s) => typeof existing[s] !== 'string');
  let rejected = 0;
  for (let i = 0; i < todo.length; i += BATCH) {
    const items = todo.slice(i, i + BATCH);
    let answer = {};
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        answer = await translateBatch(lang, items, key);
        break;
      } catch (error) {
        log('warn', 'A translation batch failed, retrying', { lang, attempt, error: error.message });
        if (attempt === 3) throw error;
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    items.forEach((source, j) => {
      const out = answer[String(j)];
      if (typeof out === 'string' && out.trim() && keepsTokens(source, out)) existing[source] = out;
      else rejected++;
    });
  }
  const kept = Object.fromEntries(strings.filter((s) => typeof existing[s] === 'string').map((s) => [s, existing[s]]));
  writeFileSync(file, `${JSON.stringify(kept, null, 1)}\n`);
  log(rejected ? 'warn' : 'info', 'Translated a language', { lang, total: strings.length, translated: Object.keys(kept).length, rejected });
  return rejected;
}

async function main() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  const strings = JSON.parse(readFileSync(join(ROOT, 'lib/i18n-strings.json'), 'utf8'));
  mkdirSync(OUT, { recursive: true });
  const langs = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(NAMES);
  let rejected = 0;
  for (const lang of langs) {
    if (!NAMES[lang]) throw new Error(`Unknown language: ${lang}`);
    rejected += await translateLang(lang, strings, key);
  }
  if (rejected) log('warn', 'Some strings stay in English; run again to retry them', { rejected });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { log('error', 'Translation failed', { error: error.message }); process.exit(1); });
}
