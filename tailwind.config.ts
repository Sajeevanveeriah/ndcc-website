import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class',
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontSize: { xs: ['0.875rem', '1.4rem'], sm: ['1rem', '1.5rem'] },
      colors: {
        maroon: {
          50: '#fdf2f2',
          100: '#fce4e4',
          200: '#f9c9c9',
          300: '#f4a3a3',
          400: '#e06060',
          500: '#c93030',
          // Official club maroon. 800-950 stay as deeper variants of it.
          600: '#880000',
          700: '#880000',
          800: '#600000',
          900: '#4a0000',
          950: '#2d0000',
        },
        // Official club blue. Never use it as text on light surfaces or behind
        // white text (1.9:1 on white); pair it with navy or maroon text.
        sky_accent: {
          DEFAULT: '#8cc6d1',
          light: '#b3d9e0',
        },
        // Club neutrals: navy for text on blue/gold, cream for warm surfaces.
        navy: '#162845',
        cream: '#FBF7F0',
        // Official club gold (400) with white tints above it and darker
        // shades below it. Gold is never text on light surfaces (1.7:1).
        gold: {
          50: '#fdf8ef',
          100: '#fbf0d9',
          200: '#f6e0b2',
          300: '#f1d18c',
          400: '#edc266',
          500: '#a98a48',
          600: '#89703b',
        },
        // Semantic theme tokens backed by CSS variables declared in app/globals.css.
        // These flip automatically with the `.dark` class — no dark: variant needed.
        surface: {
          page: 'rgb(var(--surface-page) / <alpha-value>)',
          elevated: 'rgb(var(--surface-elevated) / <alpha-value>)',
          card: 'rgb(var(--surface-card) / <alpha-value>)',
          muted: 'rgb(var(--surface-muted) / <alpha-value>)',
          nav: 'rgb(var(--surface-nav) / <alpha-value>)',
          footer: 'rgb(var(--surface-footer) / <alpha-value>)',
          'blue-subtle': 'rgb(var(--surface-blue-subtle) / <alpha-value>)',
          'blue-card': 'rgb(var(--surface-blue-card) / <alpha-value>)',
        },
        content: {
          primary: 'rgb(var(--text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--text-muted) / <alpha-value>)',
          inverse: 'rgb(var(--text-inverse) / <alpha-value>)',
          blue: 'rgb(var(--text-blue) / <alpha-value>)',
        },
        edge: {
          subtle: 'rgb(var(--border-subtle) / <alpha-value>)',
          strong: 'rgb(var(--border-strong) / <alpha-value>)',
          blue: 'rgb(var(--border-blue) / <alpha-value>)',
        },
        status: {
          success: 'rgb(var(--status-success) / <alpha-value>)',
          warning: 'rgb(var(--status-warning) / <alpha-value>)',
          error: 'rgb(var(--status-error) / <alpha-value>)',
        },
        brand: {
          maroon: 'rgb(var(--brand-maroon-surface) / <alpha-value>)',
          blue: 'rgb(var(--brand-blue-surface) / <alpha-value>)',
          gold: 'rgb(var(--brand-gold) / <alpha-value>)',
        },
      },
      boxShadow: {
        soft: '0 1px 2px rgba(45,0,0,0.04), 0 4px 16px rgba(45,0,0,0.06)',
        card: '0 1px 3px rgba(17,24,39,0.06), 0 10px 28px -10px rgba(45,0,0,0.12)',
        lift: '0 16px 38px -14px rgba(45,0,0,0.30)',
      },
      fontFamily: {
        // CSS variables provided by next/font in app/layout.tsx.
        display: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        body: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
