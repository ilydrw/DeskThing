import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../distribution.json', () => ({
  default: {
    DESKTHING_APP_CATALOG_REPOSITORY: 'https://github.com/example/apps',
    DESKTHING_CLIENT_CATALOG_REPOSITORY: 'https://github.com/example/clients',
    DESKTHING_UPDATE_FEED_URL: 'https://updates.example.test/stable'
  }
}))

import { getServiceConfig } from '@server/config/serviceConfig'

beforeEach(() => {
  vi.stubEnv('DESKTHING_APP_CATALOG_REPOSITORY', undefined)
  vi.stubEnv('DESKTHING_CLIENT_CATALOG_REPOSITORY', undefined)
  vi.stubEnv('DESKTHING_UPDATE_FEED_URL', undefined)
})
afterEach(() => vi.unstubAllEnvs())

describe('bundled distribution services', () => {
  it('provides catalogs and update feed without environment setup', async () => {
    const services = getServiceConfig()
    expect(services.appCatalogRepository).toBe('https://github.com/example/apps')
    expect(services.clientCatalogRepository).toBe('https://github.com/example/clients')
    expect(services.updateFeedUrl).toBe('https://updates.example.test/stable')
    const metadata = await import('@server/static/releaseMetadata')
    expect(metadata.defaultAppLatestJSONFallback.repositories).toEqual([
      services.appCatalogRepository
    ])
    expect(metadata.defaultClientLatestJSONFallback.repositories).toEqual([
      services.clientCatalogRepository
    ])
  })

  it('allows operators to override or disable a bundled service', () => {
    vi.stubEnv('DESKTHING_APP_CATALOG_REPOSITORY', '')
    vi.stubEnv('DESKTHING_UPDATE_FEED_URL', 'https://custom.example.test/updates')
    expect(getServiceConfig().appCatalogRepository).toBeNull()
    expect(getServiceConfig().updateFeedUrl).toBe('https://custom.example.test/updates')
  })

  it('does not silently fall back to the bundled feed after an invalid override', () => {
    vi.stubEnv('DESKTHING_UPDATE_FEED_URL', 'file:///tmp/updates')
    expect(getServiceConfig().updateFeedUrl).toBeNull()
  })
})
