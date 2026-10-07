import type { PullResponse, PushResponse, SyncBundle } from './types'

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

function joinUrl(base: string, path: string): string {
  const b = base.trim().replace(/\/+$/, '')
  return `${b}${path}`
}

function headers(code: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${code}`,
  }
}

async function withTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  ms = 15000,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function parseError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  if (text) {
    try {
      const body = JSON.parse(text) as { error?: string }
      if (body.error) return body.error
    } catch {
      // fall through to the raw text
    }
    return text.slice(0, 300)
  }
  return `HTTP ${res.status}`
}

export async function pull(
  url: string,
  code: string,
  since: number,
  fetchImpl: FetchLike = fetch,
): Promise<PullResponse> {
  const res = await withTimeout(fetchImpl, joinUrl(url, `/sync/pull?since=${since}`), {
    method: 'GET',
    headers: headers(code),
  })
  if (!res.ok) throw new Error(`Pull failed: ${await parseError(res)}`)
  return (await res.json()) as PullResponse
}

export async function push(
  url: string,
  code: string,
  bundle: SyncBundle,
  fetchImpl: FetchLike = fetch,
): Promise<PushResponse> {
  const res = await withTimeout(fetchImpl, joinUrl(url, '/sync/push'), {
    method: 'POST',
    headers: headers(code),
    body: JSON.stringify(bundle),
  })
  if (!res.ok) throw new Error(`Push failed: ${await parseError(res)}`)
  return (await res.json()) as PushResponse
}
