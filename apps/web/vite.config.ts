import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Custom service worker so the cache policy (no RPC/relayer/auth/decrypted data) is explicit code.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // "prompt": never reload mid-transaction; the user applies updates.
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Minority Rush',
        short_name: 'Minority Rush',
        description: 'One choice. One secret stake. Outsmart the crowd.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait-primary',
        background_color: '#171b3d',
        theme_color: '#171b3d',
        categories: ['games', 'entertainment'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        // The FHE wasm bundles are large; they are loaded from the network on demand, not precached.
        globPatterns: ['**/*.{html,css,svg,png,woff2}', 'assets/index-*.js'],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
