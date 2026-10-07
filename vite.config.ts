import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as {
  version: string
}

export default defineConfig(() => {
  const base = process.env.GITHUB_PAGES_BASE ?? '/'
  // Absolute origin+base for Open Graph tags (crawlers reject relative og:image).
  const siteUrl = process.env.SITE_URL ?? `http://localhost:5173${base}`
  // Optional default for the sync server URL. Empty means "use this app's own
  // origin", which is right when the sync backend serves the app (the container
  // image); set it when the app is hosted elsewhere (e.g. GitHub Pages) and the
  // sync backend lives on another host.
  const syncUrl = process.env.SYNC_URL ?? ''
  return {
    base,
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __SYNC_URL__: JSON.stringify(syncUrl),
    },
    plugins: [
      {
        name: 'ping:site-url',
        transformIndexHtml: (html: string) => html.replaceAll('%SITE_URL%', siteUrl),
      },
      vue(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'pwa.svg', 'pwa-maskable.svg'],
        manifest: {
          name: 'Ping — Table Tennis Tournaments',
          short_name: 'Ping',
          description: 'Plan and run table-tennis tournaments. Works offline.',
          theme_color: '#0090a7',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '.',
          scope: '.',
          icons: [
            { src: 'pwa.svg', sizes: 'any', type: 'image/svg+xml' },
            { src: 'pwa-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
