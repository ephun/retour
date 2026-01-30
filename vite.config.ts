import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

function getBaseUrl() {
  const { homepage } = JSON.parse(readFileSync('package.json', 'utf-8')) as {
    homepage?: string;
  };
  if (!homepage) return '/';

  // If it's a full URL, extract just the pathname
  if (homepage.startsWith('http')) {
    const url = new URL(homepage);
    return url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, '') + '/';
  }

  const base = homepage.startsWith('/') ? homepage : `/${homepage}`;
  return base.replace(/\/$/, '') + '/';
}

export default defineConfig({
  base: getBaseUrl(),
  plugins: [
    react(),
    svgr({
      include: '**/*.svg',
      svgrOptions: { exportType: 'named', namedExport: 'ReactComponent' },
    }),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\/tile\/.*$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'map-tiles',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
            },
          },
          {
            urlPattern: /\/route$|\/isochrone$|\/height$|\/locate$|\/status$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'valhalla-api',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60,
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    open: true,
  },
  build: {
    outDir: 'build',
  },
});
