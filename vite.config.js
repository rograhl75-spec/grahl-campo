import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo-sm.png', 'favicon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'modelos/*.docx'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,docx,svg,woff2,json}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
      manifest: {
        name: 'GRAHL Campo – Perícias',
        short_name: 'GRAHL Campo',
        description: 'Preparação e trabalho de campo de perícias judiciais e extrajudiciais',
        lang: 'pt-BR',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#F4F6FA',
        theme_color: '#1B365D',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: { environment: 'node' },
});
