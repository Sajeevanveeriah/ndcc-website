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
    },
  },
  plugins: [],
};
export default config;
