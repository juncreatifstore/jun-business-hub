import type { Config } from "tailwindcss";

/**
 * Colour tokens are HSL channel triplets in CSS variables (see app/globals.css)
 * so every colour supports Tailwind alpha (`bg-ink/[0.04]`) and can be re-themed
 * at runtime (light / dark shell, Settings > Branding overrides).
 */
const hsl = (v: string) => `hsl(var(${v}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Brand
        night: { DEFAULT: hsl("--jun-night"), soft: hsl("--jun-night-soft") },
        electric: hsl("--jun-electric"),
        gold: hsl("--jun-gold"),

        // Semantic — canvas and elevation
        canvas: hsl("--jun-canvas"),
        surface: {
          DEFAULT: hsl("--jun-surface"),
          1: hsl("--jun-surface-1"),
          2: hsl("--jun-surface-2"),
          3: hsl("--jun-surface-3"),
        },
        line: { DEFAULT: hsl("--jun-line"), strong: hsl("--jun-line-strong") },

        // Semantic — text
        ink: {
          DEFAULT: hsl("--jun-ink"),
          2: hsl("--jun-ink-2"),
          3: hsl("--jun-ink-3"),
        },
        muted2: hsl("--jun-ink-3"), // legacy alias

        // Semantic — accent and status (each has a `soft` background tint)
        accent: { DEFAULT: hsl("--jun-accent"), soft: hsl("--jun-accent-soft"), fg: hsl("--jun-accent-fg") },
        success: { DEFAULT: hsl("--jun-success"), soft: hsl("--jun-success-soft") },
        warning: { DEFAULT: hsl("--jun-warning"), soft: hsl("--jun-warning-soft") },
        danger: { DEFAULT: hsl("--jun-danger"), soft: hsl("--jun-danger-soft") },
        info: { DEFAULT: hsl("--jun-info"), soft: hsl("--jun-info-soft") },
        neutral: { DEFAULT: hsl("--jun-neutral"), soft: hsl("--jun-neutral-soft") },

        // Sidebar is always on the night palette; these stay readable in both themes.
        nav: {
          DEFAULT: hsl("--jun-nav"),
          fg: hsl("--jun-nav-fg"),
          muted: hsl("--jun-nav-muted"),
          line: hsl("--jun-nav-line"),
          active: hsl("--jun-nav-active"),
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: { xl2: "1rem" },
      boxShadow: {
        // One elevation scale, tuned per theme via variables.
        card: "var(--jun-shadow-card)",
        pop: "var(--jun-shadow-pop)",
      },
      fontSize: {
        // Type scale for dense operational UI (base 14px inside the hub).
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
    },
  },
  plugins: [],
};
export default config;
