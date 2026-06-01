// Lightweight i18n layer. Two dictionaries (en/es), a t() lookup, and a
// useT() hook that re-renders subscribed components when the language setting
// changes. Language is persisted in settings.ts (single source of truth).

import { useEffect, useState } from 'react';
import { en, type TKey } from '../i18n/en';
import { es } from '../i18n/es';
import { getSettings, subscribe as subSettings, type Language } from './settings';

const DICTS: Record<Language, Record<TKey, string>> = { en, es };

/** Translate a key, interpolating {name} placeholders from `vars`. */
export function t(key: TKey, vars?: Record<string, string | number>): string {
  const lang = getSettings().language;
  let str = DICTS[lang]?.[key] ?? en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{${k}}`, String(v));
    }
  }
  return str;
}

/** Hook: returns a `t` bound to the current language and re-renders on change. */
export function useT(): typeof t {
  const [, force] = useState(0);
  useEffect(() => subSettings(() => force((n) => n + 1)), []);
  return t;
}
