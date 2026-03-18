import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      /* Design tokens — mirror globals.css; Tailwind v4 also reads @theme in CSS */
      colors: {
        surface: {
          1: "var(--surface-1)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
          4: "var(--surface-4)",
          5: "var(--surface-5)",
        },
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        muted: "var(--text-muted)",
        accent: {
          green: "var(--accent-green)",
          amber: "var(--accent-amber)",
          red: "var(--accent-red)",
          blue: "var(--accent-blue)",
          purple: "var(--accent-purple)",
        },
        subtle: "var(--border-subtle)",
        emphasis: "var(--border-emphasis)",
      },
      fontSize: {
        micro: ["var(--font-size-micro)", { lineHeight: "1.25" }],
        small: ["var(--font-size-small)", { lineHeight: "1.4" }],
        body: ["var(--font-size-body)", { lineHeight: "1.5" }],
        "heading-3": ["var(--font-size-heading-3)", { lineHeight: "1.35" }],
        "heading-2": ["var(--font-size-heading-2)", { lineHeight: "1.3" }],
        "heading-1": ["var(--font-size-heading-1)", { lineHeight: "1.2" }],
        display: ["var(--font-size-display)", { lineHeight: "1.15" }],
      },
    },
  },
  plugins: [],
};

export default config;
