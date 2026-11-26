import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: "Women's Health & Reproductive Medicine Intelligence System",
        short_name: 'WHRMIS',
        description: 'Obstetrics, Gynecology, Reproductive & Fetal Medicine EMR',
        theme_color: '#7c2d5b',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Never cache API / auth / storage responses: PHI must not persist in the SW cache.
        navigateFallbackDenylist: [/^\/auth/, /^\/rest/, /^\/storage/],
        runtimeCaching: [],
      },
    }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as never);
