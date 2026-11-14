import { createContext, createElement, Fragment, useCallback, useContext } from 'react';
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

export const LangContext = createContext<Lang>(DEFAULT_LANG);

export function LangProvider({ lang = DEFAULT_LANG, children }: { lang?: Lang; children?: ReactNode }) {
  return createElement(LangContext.Provider, { value: lang }, children);
}

export function useT(): TFunction {
  const lang = useContext(LangContext);
  return useCallback((text, vars) => translate(lang, text, vars), [lang]);
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
  return useContext(LangContext);
}
