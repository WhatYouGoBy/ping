import { describe, expect, test } from 'bun:test'
import { defaultSyncUrl } from './config'

describe('defaultSyncUrl', () => {
  test('prefers the build-time override', () => {
    expect(defaultSyncUrl('https://ping.whatyougoby.com', 'https://user.github.io')).toBe(
      'https://ping.whatyougoby.com',
    )
  })

  test('falls back to the page origin when unset', () => {
    expect(defaultSyncUrl('', 'https://user.github.io')).toBe('https://user.github.io')
  })

  test('treats whitespace-only overrides as unset', () => {
    expect(defaultSyncUrl('   ', 'https://user.github.io')).toBe('https://user.github.io')
  })
})
