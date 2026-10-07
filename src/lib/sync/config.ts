import type { SyncConfig } from './types'

export const SYNC_KEY = 'ping.sync.v1'

/**
 * Pick the prefill for the sync server URL. A build-time override (the
 * `SYNC_URL` env var, inlined as `__SYNC_URL__`) wins; otherwise fall back to
 * the page's own origin, which is correct when the sync backend serves the app.
 */
export function defaultSyncUrl(buildUrl: string, origin: string): string {
  return buildUrl.trim() || origin
}

export function defaultSyncConfig(url = ''): SyncConfig {
  return {
    enabled: false,
    url,
    code: '',
    cursor: 0,
    lastSyncedAt: null,
    lastError: null,
  }
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** Read the persisted sync settings, filling in defaults for missing keys. */
export function loadSyncConfig(fallbackUrl = ''): SyncConfig {
  const base = defaultSyncConfig(fallbackUrl)
  const raw = storage()?.getItem(SYNC_KEY)
  if (!raw) return base
  try {
    const parsed = JSON.parse(raw) as Partial<SyncConfig>
    return {
      enabled: parsed.enabled === true,
      url: typeof parsed.url === 'string' ? parsed.url : base.url,
      code: typeof parsed.code === 'string' ? parsed.code : '',
      cursor: typeof parsed.cursor === 'number' ? parsed.cursor : 0,
      lastSyncedAt: typeof parsed.lastSyncedAt === 'number' ? parsed.lastSyncedAt : null,
      lastError: typeof parsed.lastError === 'string' ? parsed.lastError : null,
    }
  } catch {
    return base
  }
}

export function saveSyncConfig(config: SyncConfig): void {
  storage()?.setItem(SYNC_KEY, JSON.stringify(config))
}

export function clearSyncConfig(): void {
  storage()?.removeItem(SYNC_KEY)
}
