import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // JUN brand tokens — can be overridden at runtime via CSS variables (Settings > Branding)
        night: {
          DEFAULT: "hsl(var(--jun-night) / <alpha-value>)",
          soft: "hsl(var(--jun-night-soft) / <alpha-value>)",
        },
        electric: "hsl(var(--jun-electric) / <alpha-value>)",
        gold: "hsl(var(--jun-gold) / <alpha-value>)",
        surface: "hsl(var(--jun-surface) / <alpha-value>)",
        line: "hsl(var(--jun-line) / <alpha-value>)",
        ink: "hsl(var(--jun-ink) / <alpha-value>)",
        muted2: "hsl(var(--jun-muted) / <alpha-value>)",
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      borderRadius: { xl2: "1rem" },
    },
  },
  plugins: [],
};
export default config;
