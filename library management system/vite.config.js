import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const apiPort = Number(process.env.API_PORT ?? 3001)
const vitePort = Number(process.env.VITE_PORT ?? 5173)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['libraai-icon.svg', 'favicon.ico'],
      manifest: {
        name: 'LibraAI - Department Digital Library',
        short_name: 'LibraAI',
        description: 'Department digital library for books, study resources and library circulation.',
        theme_color: '#246b52',
        background_color: '#f5f7f4',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/libraai-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/libraai-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/libraai-icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp,pdf,woff,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: 'NetworkOnly',
            method: 'GET',
          },
        ],
      },
      devOptions: { enabled: true },
    }),
  ],
  server: {
    host: '127.0.0.1',
    port: vitePort,
    proxy: {
      '/api': `http://127.0.0.1:${apiPort}`,
    },
  },
})
