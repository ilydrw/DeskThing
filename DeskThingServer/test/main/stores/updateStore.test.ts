import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  app: {
    isPackaged: true,
    getVersion: vi.fn(() => '1.0.0')
  },
  autoUpdater: {
    logger: null as unknown,
    autoDownload: true,
    autoInstallOnAppQuit: false,
    setFeedURL: vi.fn(),
    on: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn()
  },
  getServiceConfig: vi.fn()
}))

vi.mock('electron', () => ({
  app: mocks.app
}))

vi.mock('electron-updater', () => ({
  default: {
    autoUpdater: mocks.autoUpdater
  }
}))

vi.mock('@server/config/serviceConfig', () => ({
  getServiceConfig: mocks.getServiceConfig
}))

vi.mock('@server/utils/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    log: vi.fn()
  }
}))

describe('UpdateStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mocks.app.isPackaged = true
    mocks.app.getVersion.mockReturnValue('1.0.0')
    mocks.autoUpdater.autoDownload = true
    mocks.autoUpdater.autoInstallOnAppQuit = false
    mocks.getServiceConfig.mockReturnValue({ updateFeedUrl: null })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps update checks disabled when the fork has no configured feed', async () => {
    const { UpdateStore } = await import('@server/stores/updateStore')
    const store = new UpdateStore()

    await expect(store.checkForUpdates()).resolves.toBe('Application updates are not configured')
    expect(mocks.autoUpdater.setFeedURL).not.toHaveBeenCalled()
    expect(mocks.autoUpdater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('configures a generic feed without downloading during the check', async () => {
    mocks.getServiceConfig.mockReturnValue({
      updateFeedUrl: 'https://updates.example.test/stable'
    })
    mocks.autoUpdater.checkForUpdates.mockResolvedValue({
      updateInfo: {
        version: '1.1.0',
        releaseNotes: 'Safer reconnects',
        releaseName: 'DeskThing 1.1.0',
        releaseDate: '2026-07-25'
      }
    })

    const { UpdateStore } = await import('@server/stores/updateStore')
    const store = new UpdateStore()

    await expect(store.checkForUpdates()).resolves.toBe('Update available')
    expect(mocks.autoUpdater.setFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: 'https://updates.example.test/stable'
    })
    expect(mocks.autoUpdater.autoDownload).toBe(false)
    expect(mocks.autoUpdater.autoInstallOnAppQuit).toBe(true)
    expect(store.getUpdateStatus()).toMatchObject({
      updateAvailable: true,
      updateDownloaded: false,
      version: '1.1.0'
    })

    await store.startDownload()
    expect(mocks.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(mocks.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1)
  })
})
