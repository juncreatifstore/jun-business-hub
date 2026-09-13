/**
 * Two-language UI (French default, English). The preference lives in a cookie
 * so the server renders the right language on first paint. Strings are given
 * inline as (fr, en) pairs: `t("Fichiers", "Files")`.
 */
export const LANG_COOKIE = "jun_lang";
export type Lang = "fr" | "en";
export const DEFAULT_LANG: Lang = "fr";

export function parseLang(value: string | undefined | null): Lang {
  return value === "en" ? "en" : DEFAULT_LANG;
}

export type T = (fr: string, en: string) => string;
export function makeT(lang: Lang): T {
  return (fr, en) => (lang === "en" ? en : fr);
}
