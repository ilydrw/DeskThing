import { afterEach, describe, expect, it, vi } from 'vitest'
import { getServiceConfig } from '@server/config/serviceConfig'

describe('getServiceConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('keeps optional distribution services disabled by default', () => {
    vi.stubEnv('DESKTHING_APP_CATALOG_REPOSITORY', '')
    vi.stubEnv('DESKTHING_CLIENT_CATALOG_REPOSITORY', '')
    vi.stubEnv('DESKTHING_FIRMWARE_API_URL', '')
    vi.stubEnv('DESKTHING_RECOMMENDED_FIRMWARE_URL', '')
    vi.stubEnv('DESKTHING_DRIVER_INSTALLER_URL', '')
    vi.stubEnv('DESKTHING_DRIVER_INSTALLER_SHA256', '')
    vi.stubEnv('DESKTHING_UPDATE_FEED_URL', '')
    vi.stubEnv('DESKTHING_PROXY_ALLOW_PRIVATE_NETWORK', '')

    const config = getServiceConfig()

    expect(config.appCatalogRepository).toBeNull()
    expect(config.clientCatalogRepository).toBeNull()
    expect(config.firmwareApiUrl).toBeNull()
    expect(config.recommendedFirmwareUrl).toBeNull()
    expect(config.driverInstallerUrl).toBeNull()
    expect(config.driverInstallerSha256).toBeNull()
    expect(config.updateFeedUrl).toBeNull()
    expect(config.proxyAllowPrivateNetwork).toBe(false)
  })

  it('normalizes configured URLs and accepts a valid SHA-256 digest', () => {
    const digest = 'a'.repeat(64)
    vi.stubEnv('DESKTHING_APP_CATALOG_REPOSITORY', 'https://github.com/example/apps/')
    vi.stubEnv('DESKTHING_FIRMWARE_API_URL', 'https://firmware.example.test/api/v1/')
    vi.stubEnv('DESKTHING_DRIVER_INSTALLER_URL', 'https://downloads.example.test/driver.exe')
    vi.stubEnv('DESKTHING_DRIVER_INSTALLER_SHA256', digest.toUpperCase())
    vi.stubEnv('DESKTHING_UPDATE_FEED_URL', 'https://updates.example.test/stable/')
    vi.stubEnv('DESKTHING_PROXY_ALLOW_PRIVATE_NETWORK', 'yes')

    const config = getServiceConfig()

    expect(config.appCatalogRepository).toBe('https://github.com/example/apps')
    expect(config.firmwareApiUrl).toBe('https://firmware.example.test/api/v1')
    expect(config.driverInstallerUrl).toBe('https://downloads.example.test/driver.exe')
    expect(config.driverInstallerSha256).toBe(digest)
    expect(config.updateFeedUrl).toBe('https://updates.example.test/stable')
    expect(config.proxyAllowPrivateNetwork).toBe(true)
  })

  it('rejects unsupported URL schemes and malformed digests', () => {
    vi.stubEnv('DESKTHING_FIRMWARE_API_URL', 'file:///tmp/firmware')
    vi.stubEnv('DESKTHING_DRIVER_INSTALLER_URL', 'javascript:alert(1)')
    vi.stubEnv('DESKTHING_DRIVER_INSTALLER_SHA256', 'not-a-digest')
    vi.stubEnv('DESKTHING_UPDATE_FEED_URL', 'file:///tmp/updates')

    const config = getServiceConfig()

    expect(config.firmwareApiUrl).toBeNull()
    expect(config.driverInstallerUrl).toBeNull()
    expect(config.driverInstallerSha256).toBeNull()
    expect(config.updateFeedUrl).toBeNull()
  })
})
