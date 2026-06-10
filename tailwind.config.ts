import type { Config } from "tailwindcss";

const config: Config = {
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
      },
      fontFamily: {
        display: ['Barlow Condensed', 'Oswald', 'Archivo', 'Inter', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
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
