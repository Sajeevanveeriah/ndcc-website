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
      colors: {
        maroon: {
          50: '#fdf2f2',
          100: '#fce4e4',
          200: '#f9c9c9',
          300: '#f4a3a3',
          400: '#e06060',
          500: '#c93030',
          600: '#800000',
          700: '#800000',
          800: '#600000',
          900: '#4a0000',
          950: '#2d0000',
        },
        sky_accent: '#ADD8E6',
        // Additive only: a warm off-white for layered surfaces, plus an explicit gold
        // ramp around the existing brand gold (#D4A017) for new accents. No existing
        // brand colour values are changed.
        cream: '#FBF7F0',
        gold: {
          50: '#fbf6e9',
          100: '#f5e9c6',
          200: '#ecd591',
          300: '#e0bd55',
          400: '#d4a017',
          500: '#b8870f',
          600: '#946a0c',
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
        display: ['var(--font-barlow-condensed)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
        body: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      animation: {
        'ken-burns':  'kenBurns 18s ease-in-out infinite alternate',
        'fade-up':    'fadeUpIn 0.55s cubic-bezier(0.21,0.47,0.32,0.98) both',
        'slide-down': 'slideDownIn 0.2s ease-out both',
        'float':      'floatY 4s ease-in-out infinite',
        'shimmer':    'shimmerSweep 2s linear infinite',
        'pulse-ring': 'pulseRing 2s ease-out infinite',
      },
      keyframes: {
        kenBurns:     { '0%': { transform: 'scale(1) translate3d(0,0,0)' }, '100%': { transform: 'scale(1.07) translate3d(-1%,-0.5%,0)' } },
        fadeUpIn:     { '0%': { opacity: '0', transform: 'translateY(24px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        shimmerSweep: { '0%': { backgroundPosition: '-200% center' }, '100%': { backgroundPosition: '200% center' } },
        slideDownIn:  { '0%': { opacity: '0', transform: 'translateY(-10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        floatY:       { '0%, 100%': { transform: 'translateY(0px)' }, '50%': { transform: 'translateY(-6px)' } },
        pulseRing:    { '0%': { boxShadow: '0 0 0 0 rgba(128,0,0,0.4)' }, '70%': { boxShadow: '0 0 0 10px rgba(128,0,0,0)' }, '100%': { boxShadow: '0 0 0 0 rgba(128,0,0,0)' } },
      },
    },
  },
  plugins: [],
};
export default config;
