"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { evidenceText, rescueText, translate, type Locale, type Params } from "./index";

interface I18n {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (path: string, params?: Params) => string;
  ev: (code: string, params?: Params) => string;
  rs: (code: string, params?: Params) => string;
}

const Ctx = createContext<I18n | null>(null);
const STORAGE_KEY = "clara.locale";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring a per-viewer preference after hydration
      if (saved === "en" || saved === "es") setLocaleState(saved);
    } catch {
      /* storage unavailable: keep default */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<I18n>(
    () => ({
      locale,
      setLocale,
      t: (path, params) => translate(locale, path, params),
      ev: (code, params) => evidenceText(locale, code, params),
      rs: (code, params) => rescueText(locale, code, params),
    }),
    [locale, setLocale],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
