import { defineStore } from 'pinia'
import { defaultSyncUrl, loadSyncConfig, saveSyncConfig } from '@/lib/sync/config'
import { runSync } from '@/lib/sync/engine'
import { useTournamentsStore } from '@/stores/tournaments'

export type SyncStatus = 'disabled' | 'idle' | 'syncing' | 'synced' | 'error' | 'offline'

// Module-level so transient scheduling state never lands in the reactive store.
let timer: ReturnType<typeof setTimeout> | null = null
let inflight = false
let wired = false

function currentOrigin(): string {
  return typeof window === 'undefined' ? '' : window.location.origin
}

/**
 * Build-time sync URL override (`SYNC_URL`). Vite replaces `__SYNC_URL__` with
 * a string literal; the typeof guard keeps this safe where the define is absent
 * (e.g. the Bun test runner).
 */
function buildSyncUrl(): string {
  return typeof __SYNC_URL__ === 'string' ? __SYNC_URL__ : ''
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false
}

export const useSyncStore = defineStore('sync', {
  state: () => ({
    enabled: false,
    url: '',
    code: '',
    cursor: 0,
    lastSyncedAt: null as number | null,
    lastError: null as string | null,
    status: 'disabled' as SyncStatus,
    /** A run is scheduled or in flight. */
    pending: false,
  }),

  getters: {
    configured: (s) => s.enabled && s.url.trim().length > 0 && s.code.trim().length > 0,
    statusLabel: (s): string => {
      switch (s.status) {
        case 'disabled':
          return 'Sync off'
        case 'syncing':
          return 'Syncing…'
        case 'synced':
          return 'Synced'
        case 'error':
          return 'Sync error'
        case 'offline':
          return 'Offline'
        default:
          return 'Sync ready'
      }
    },
  },

  actions: {
    /** Load settings, wire lifecycle listeners, and run an initial sync. */
    init() {
      const cfg = loadSyncConfig(defaultSyncUrl(buildSyncUrl(), currentOrigin()))
      this.enabled = cfg.enabled
      this.url = cfg.url
      this.code = cfg.code
      this.cursor = cfg.cursor
      this.lastSyncedAt = cfg.lastSyncedAt
      this.lastError = cfg.lastError
      this.status = cfg.enabled ? 'idle' : 'disabled'

      if (!wired && typeof window !== 'undefined') {
        wired = true
        window.addEventListener('online', () => {
          if (this.configured) {
            this.status = 'idle'
            this.schedule(0)
          }
        })
        window.addEventListener('offline', () => {
          if (this.configured) this.status = 'offline'
        })
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') this.schedule(0)
        })
      }

      this.schedule(0)
    },

    persist() {
      saveSyncConfig({
        enabled: this.enabled,
        url: this.url,
        code: this.code,
        cursor: this.cursor,
        lastSyncedAt: this.lastSyncedAt,
        lastError: this.lastError,
      })
    },

    configure(patch: { enabled?: boolean; url?: string; code?: string }) {
      if (patch.enabled !== undefined) this.enabled = patch.enabled
      if (patch.url !== undefined) this.url = patch.url
      if (patch.code !== undefined) this.code = patch.code
      this.status = this.enabled ? 'idle' : 'disabled'
      this.persist()
      this.schedule(0)
    },

    /** Debounce a sync; safe to call after every mutation. */
    schedule(delay = 1500) {
      if (!this.configured) return
      this.pending = true
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        void this.runNow()
      }, delay)
    },

    async runNow() {
      if (!this.configured) return
      if (inflight) {
        this.schedule(500)
        return
      }
      if (!isOnline()) {
        this.status = 'offline'
        this.pending = false
        return
      }

      inflight = true
      this.pending = false
      this.status = 'syncing'
      const store = useTournamentsStore()
      try {
        const outcome = await runSync({
          url: this.url,
          code: this.code,
          cursor: this.cursor,
          getSnapshot: () => store.syncSnapshot(),
          applyRemote: (bundle) => store.applySyncBundle(bundle),
        })
        this.cursor = outcome.rev
        this.lastSyncedAt = Date.now()
        this.lastError = null
        this.status = 'synced'
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err)
        this.status = 'error'
      } finally {
        inflight = false
        this.persist()
      }
    },
  },
})
