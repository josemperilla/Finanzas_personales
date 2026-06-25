import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    globals: true,
  },
  build: {
    rollupOptions: {
      output: {
        // Separa dependencias estables en chunks propios para mejorar el cache
        // entre deploys: con registerType:'autoUpdate', un update de la app NO
        // re-descarga react ni framer-motion (solo cambian los chunks de la app).
        // OJO: forma de objeto a propósito — NO incluir pdfjs-dist aquí (se carga
        // dinámicamente vía import() y debe quedar en su chunk lazy).
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'framer-motion': ['framer-motion'],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-512.png', 'apple-touch-icon.png', 'profile-avatar.jpg'],
      manifest: {
        name: 'Finanzas Personales',
        short_name: 'Finanzas',
        description: 'Tu gestor de finanzas personales',
        theme_color: '#0E6B4D',
        background_color: '#F5F1EA',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      }
    })
  ],
})
