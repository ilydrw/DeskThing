import { describe, expect, it, vi } from 'vitest'
import { constructManifest } from '../../../src/main/services/apps/appValidator'
import { PlatformTypes } from '@deskthing/types'

vi.mock('@server/utils/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), log: vi.fn() }
}))

describe('constructManifest', () => {
  it('normalizes legacy platform identifiers from published app manifests', () => {
    // Verbatim platforms list from the published spotify-v0.11.1.zip manifest,
    // which shipped "macos" and was flagged incompatible on mac
    const manifest = constructManifest({
      id: 'spotify',
      version: '0.11.1',
      platforms: ['windows', 'linux', 'macos'] as PlatformTypes[]
    })

    expect(manifest.platforms).toEqual([
      PlatformTypes.WINDOWS,
      PlatformTypes.LINUX,
      PlatformTypes.MAC
    ])
    expect(manifest.platforms).toContain(PlatformTypes.MAC)
  })

  it('defaults to all platforms when none are declared', () => {
    const manifest = constructManifest({ id: 'test' })
    expect(manifest.platforms).toEqual(Object.values(PlatformTypes))
  })
})
