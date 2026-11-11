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
    mocks.autoUpdater.downloadUpdate.mockReset()
    mocks.autoUpdater.checkForUpdates.mockReset()
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

  it('coalesces simultaneous downloads and allows retry after failure', async () => {
    mocks.getServiceConfig.mockReturnValue({ updateFeedUrl: 'https://updates.example.test/stable' })
    const { UpdateStore } = await import('@server/stores/updateStore')
    const store = new UpdateStore()
    store.setUpdateStatus({ updateAvailable: true, updateDownloaded: false, version: '1.1.0' })
    let finish: () => void = () => {}
    mocks.autoUpdater.downloadUpdate.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        })
    )
    const first = store.startDownload()
    const second = store.startDownload()
    await vi.waitFor(() => expect(mocks.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1))
    finish()
    await Promise.all([first, second])

    mocks.autoUpdater.downloadUpdate.mockRejectedValueOnce(new Error('Connection lost'))
    await store.startDownload()
    expect(store.getUpdateStatus()).toMatchObject({
      failed: true,
      error: expect.stringContaining('Connection lost')
    })
    mocks.autoUpdater.downloadUpdate.mockResolvedValueOnce(undefined)
    await store.startDownload()
    expect(mocks.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(3)
    expect(store.getUpdateStatus()).toMatchObject({ failed: false })
  })

  it('does not install before an update has finished downloading', async () => {
    mocks.getServiceConfig.mockReturnValue({ updateFeedUrl: 'https://updates.example.test/stable' })
    const { UpdateStore } = await import('@server/stores/updateStore')
    const store = new UpdateStore()
    await store.initialize()
    store.setUpdateStatus({ updateAvailable: true, updateDownloaded: false })
    store.quitAndInstall()
    expect(mocks.autoUpdater.quitAndInstall).not.toHaveBeenCalled()
    store.setUpdateStatus({ updateAvailable: true, updateDownloaded: true })
    await store.startDownload()
    expect(mocks.autoUpdater.downloadUpdate).not.toHaveBeenCalled()
    store.quitAndInstall()
    expect(mocks.autoUpdater.quitAndInstall).toHaveBeenCalledOnce()
  })

  it('offers a stable release to a prerelease build', async () => {
    mocks.getServiceConfig.mockReturnValue({ updateFeedUrl: 'https://updates.example.test/stable' })
    mocks.app.getVersion.mockReturnValue('1.1.0-beta.1')
    mocks.autoUpdater.checkForUpdates.mockResolvedValue({ updateInfo: { version: '1.1.0' } })
    const { UpdateStore } = await import('@server/stores/updateStore')
    const store = new UpdateStore()

    await expect(store.checkForUpdates()).resolves.toBe('Update available')

    mocks.app.getVersion.mockReturnValue('1.1.0')
    await expect(store.checkForUpdates()).resolves.toBe('No update available')
  })

  it('keeps release details and download state when a later step fails', async () => {
    mocks.getServiceConfig.mockReturnValue({ updateFeedUrl: 'https://updates.example.test/stable' })
    mocks.autoUpdater.checkForUpdates.mockResolvedValue({
      updateInfo: {
        version: '1.1.0',
        releaseName: 'DeskThing 1.1.0',
        releaseNotes: [
          { version: '1.1.0', note: 'Safer reconnects' },
          { version: '1.0.1', note: null }
        ]
      }
    })
    const { UpdateStore } = await import('@server/stores/updateStore')
    const store = new UpdateStore()
    const errors: string[] = []
    store.on('update-error', (message) => errors.push(message))
    await store.checkForUpdates()
    expect(store.getUpdateStatus()?.releaseNotes).toBe('Safer reconnects')

    const emitUpdaterError = mocks.autoUpdater.on.mock.calls.find(
      ([event]) => event === 'error'
    )?.[1] as (error: Error) => void
    mocks.autoUpdater.downloadUpdate.mockImplementationOnce(async () => {
      emitUpdaterError(new Error('Connection lost'))
      throw new Error('Connection lost')
    })
    await store.startDownload()

    expect(store.getUpdateStatus()).toMatchObject({
      updateAvailable: true,
      updateDownloaded: false,
      failed: true,
      error: 'Connection lost',
      version: '1.1.0',
      releaseName: 'DeskThing 1.1.0'
    })
    expect(errors).toEqual(['Connection lost'])

    store.setUpdateStatus({ updateAvailable: true, updateDownloaded: true, version: '1.1.0' })
    await store.checkForUpdates()
    expect(store.getUpdateStatus()).toMatchObject({ updateDownloaded: true, version: '1.1.0' })
  })
})
