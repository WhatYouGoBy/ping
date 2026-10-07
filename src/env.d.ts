/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

/** Inlined at build time from package.json. Bumped by semantic-release in CI. */
declare const __APP_VERSION__: string

/**
 * Inlined at build time from the `SYNC_URL` env var. Default prefill for the
 * sync server URL; empty means fall back to the page's own origin.
 */
declare const __SYNC_URL__: string
