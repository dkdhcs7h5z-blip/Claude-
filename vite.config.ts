import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath, URL } from 'node:url';

// VITE_EMBED=1: one self-contained HTML file for sandboxed previews (demo data,
// in-memory routing, no service worker). The normal build is unaffected.
const embed = !!process.env.VITE_EMBED;

export default defineConfig({
  plugins: embed ? [react(), viteSingleFile()] : [
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
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      ...(embed ? { 'virtual:pwa-register': fileURLToPath(new URL('./src/embed/pwa-stub.ts', import.meta.url)) } : {}),
    },
  },
  ...(embed ? { base: './', build: { outDir: 'dist-embed' } } : {}),
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
} as never);
