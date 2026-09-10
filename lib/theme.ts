/** Shell theme preference. Stored in a cookie so the server renders the right
 *  theme on first paint (no flash) and it follows the user across devices
 *  only if they choose the same setting there — deliberately simple. */
export const THEME_COOKIE = "jun_theme";
export type Theme = "light" | "dark";
export const DEFAULT_THEME: Theme = "light";

export function parseTheme(value: string | undefined | null): Theme {
  return value === "dark" ? "dark" : DEFAULT_THEME;
}
