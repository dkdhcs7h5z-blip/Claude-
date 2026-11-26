import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf2f8', 100: '#fce7f3', 200: '#fbcfe8', 300: '#f9a8d4', 400: '#e879b9',
          500: '#c2468f', 600: '#a3346f', 700: '#7c2d5b', 800: '#5f2346', 900: '#451a34',
        },
        obstetrics: '#db2777',
        gynecology: '#7c3aed',
        infertility: '#0d9488',
        fetal: '#2563eb',
      },
      fontFamily: {
        sans: ['Inter', 'IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
