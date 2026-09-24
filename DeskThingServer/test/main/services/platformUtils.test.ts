import { describe, expect, it } from 'vitest'
import { normalizePlatforms } from '@shared/utils/platformUtils'
import { PlatformTypes } from '@deskthing/types'

describe('normalizePlatforms', () => {
  it('translates the legacy "macos" identifier to PlatformTypes.MAC', () => {
    // Spotify v0.11.1 and other pre-0.11.2 published apps shipped this manifest value
    expect(normalizePlatforms(['windows', 'linux', 'macos'])).toEqual([
      PlatformTypes.WINDOWS,
      PlatformTypes.LINUX,
      PlatformTypes.MAC
    ])
  })

  it('translates other known aliases and case variants', () => {
    expect(normalizePlatforms(['osx', 'darwin', 'win', 'win32', 'MacOS'])).toEqual([
      PlatformTypes.MAC,
      PlatformTypes.MAC,
      PlatformTypes.WINDOWS,
      PlatformTypes.WINDOWS,
      PlatformTypes.MAC
    ])
  })

  it('leaves canonical values untouched', () => {
    const canonical = Object.values(PlatformTypes)
    expect(normalizePlatforms(canonical)).toEqual(canonical)
  })

  it('preserves unrecognized values rather than dropping them', () => {
    expect(normalizePlatforms(['toaster'])).toEqual(['toaster'])
  })

  it('returns undefined when no platforms are provided', () => {
    expect(normalizePlatforms(undefined)).toBeUndefined()
  })
})
