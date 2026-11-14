import { createContext, createElement, Fragment, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type Lang = string;
export type Vars = Record<string, string | number>;

export const DEFAULT_LANG: Lang = 'en';

export const DICTIONARIES: Record<string, Record<string, string>> = {
  en: {},
};

export function translate(lang: Lang, text: string, vars?: Vars): string {
  const raw = DICTIONARIES[lang]?.[text] ?? text;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole,
  );
}

export type TFunction = (text: string, vars?: Vars) => string;

export const tOr = (t: TFunction, text?: string): string | undefined => (text ? t(text) : undefined);

/** The interface languages, each named in its own language. Same set as the poster languages. */
export const UI_LANGS: readonly { id: Lang; name: string }[] = [
  { id: 'en', name: 'English' }, { id: 'ar', name: 'العربية' }, { id: 'bg', name: 'Български' },
  { id: 'cs', name: 'Čeština' }, { id: 'da', name: 'Dansk' }, { id: 'de', name: 'Deutsch' },
  { id: 'el', name: 'Ελληνικά' }, { id: 'es', name: 'Español' }, { id: 'fa', name: 'فارسی' },
  { id: 'fi', name: 'Suomi' }, { id: 'fr', name: 'Français' }, { id: 'he', name: 'עברית' },
  { id: 'hi', name: 'हिन्दी' }, { id: 'hu', name: 'Magyar' }, { id: 'id', name: 'Bahasa Indonesia' },
  { id: 'it', name: 'Italiano' }, { id: 'ja', name: '日本語' }, { id: 'ko', name: '한국어' },
  { id: 'nl', name: 'Nederlands' }, { id: 'no', name: 'Norsk' }, { id: 'pl', name: 'Polski' },
  { id: 'pt', name: 'Português' }, { id: 'ro', name: 'Română' }, { id: 'ru', name: 'Русский' },
  { id: 'sv', name: 'Svenska' }, { id: 'ta', name: 'தமிழ்' }, { id: 'te', name: 'తెలుగు' },
  { id: 'th', name: 'ไทย' }, { id: 'tr', name: 'Türkçe' }, { id: 'uk', name: 'Українська' },
  { id: 'vi', name: 'Tiếng Việt' }, { id: 'zh', name: '简体中文' }, { id: 'zh-Hant', name: '繁體中文' },
];

const TRADITIONAL_ZH = /^zh[-_](hant|tw|hk|mo)\b/i;

export const RTL_LANGS: ReadonlySet<Lang> = new Set(['ar', 'he', 'fa']);
export const LANG_STORAGE_KEY = 'xrdb-ui-lang';
const ALIASES: Record<string, Lang> = { nb: 'no', nn: 'no', iw: 'he', in: 'id' };

/** The first supported language in a browser's preference list, by base subtag; English when none match. */
export function matchLang(tags: readonly string[] | undefined): Lang {
  for (const tag of tags ?? []) {
    if (TRADITIONAL_ZH.test(String(tag))) return 'zh-Hant';
    const base = String(tag).toLowerCase().split(/[-_]/)[0];
    const id = ALIASES[base] ?? base;
    if (UI_LANGS.some((l) => l.id === id)) return id;
  }
  return DEFAULT_LANG;
}

export function isUiLang(value: unknown): value is Lang {
  return typeof value === 'string' && UI_LANGS.some((l) => l.id === value);
}

async function loadDictionary(lang: Lang): Promise<boolean> {
  if (lang === DEFAULT_LANG || DICTIONARIES[lang]) return true;
  try {
    const res = await fetch(`/i18n/${lang}.json`, { cache: 'force-cache' });
    if (!res.ok) return false;
    DICTIONARIES[lang] = (await res.json()) as Record<string, string>;
    return true;
  } catch {
    return false;
  }
}

type LangState = { lang: Lang; setLang: (lang: Lang) => void };

export const LangContext = createContext<LangState>({ lang: DEFAULT_LANG, setLang: () => {} });

function readStoredLang(): Lang | null {
  try {
    const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
    return isUiLang(stored) ? stored : null;
  } catch {
    return null;
  }
}

function browserTags(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

/** The browser's interface language. */
export function browserLang(): Lang {
  return matchLang(browserTags());
}

/**
 * A poster language from a browser's tags, keeping a country (`pt-BR`, `es-MX`) since the renderer prefers that
 * country's posters. A script subtag is dropped (`zh-Hant-TW` gives `zh-TW`); no supported language gives English.
 */
export function matchPosterLang(tags: readonly string[] | undefined): string {
  for (const tag of tags ?? []) {
    const parts = String(tag).split(/[-_]/);
    const base = ALIASES[parts[0].toLowerCase()] ?? parts[0].toLowerCase();
    if (!UI_LANGS.some((l) => l.id === base)) continue;
    const region = parts.slice(1).find((p) => /^[a-z]{2}$/i.test(p));
    return region ? `${base}-${region.toUpperCase()}` : base;
  }
  return DEFAULT_LANG;
}

export function browserPosterLang(): string {
  return matchPosterLang(browserTags());
}

/** English on the server and first paint; then the saved choice, else the browser's language, once its text has loaded. */
export function LangProvider({ lang: fixed, children }: { lang?: Lang; children?: ReactNode }) {
  const [lang, setActive] = useState<Lang>(fixed ?? DEFAULT_LANG);

  const apply = useCallback((next: Lang, remember: boolean) => {
    if (remember) {
      try {
        window.localStorage.setItem(LANG_STORAGE_KEY, next);
      } catch {
        // Private browsing: the choice lasts for this visit only.
      }
    }
    void loadDictionary(next).then((ok) => setActive(ok ? next : DEFAULT_LANG));
  }, []);

  useEffect(() => {
    if (fixed) return;
    apply(readStoredLang() ?? browserLang(), false);
  }, [fixed, apply]);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = RTL_LANGS.has(lang) ? 'rtl' : 'ltr';
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang: (next: Lang) => apply(next, true) }), [lang, apply]);
  return createElement(LangContext.Provider, { value }, children);
}

export function useT(): TFunction {
  const { lang } = useContext(LangContext);
  return useCallback((text, vars) => translate(lang, text, vars), [lang]);
}

export function useSetLang(): (lang: Lang) => void {
  return useContext(LangContext).setLang;
}

export type RichTags = Record<string, (children: string) => ReactNode>;

export function renderRich(text: string, tags: RichTags): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /<(\w+)>([\s\S]*?)<\/\1>/g;
  let last = 0;
  let key = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const render = tags[m[1]];
    out.push(createElement(Fragment, { key: key++ }, render ? render(m[2]) : m[0]));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function useRich(): (text: string, tags: RichTags) => ReactNode[] {
  const t = useT();
  return useCallback((text, tags) => renderRich(t(text), tags), [t]);
}

export function useLang(): Lang {
  return useContext(LangContext).lang;
}
