import React, { createContext, useContext, useMemo } from 'react';
import { DEFAULT_UI_STRINGS } from './strings';

interface I18nContextValue {
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  t: (key) => DEFAULT_UI_STRINGS[key] || key,
});

export function I18nProvider({
  overrides,
  children,
}: {
  overrides?: Record<string, string>;
  children: React.ReactNode;
}) {
  const value = useMemo<I18nContextValue>(() => {
    const merged = { ...DEFAULT_UI_STRINGS, ...(overrides || {}) };
    return {
      t: (key: string, vars?: Record<string, string | number>) => {
        let text = merged[key] || key;
        if (vars) {
          for (const [k, v] of Object.entries(vars)) {
            text = text.replace(`{${k}}`, String(v));
          }
        }
        return text;
      },
    };
  }, [overrides]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
