import { UpdateStoreClass, UpdateStoreEvents } from '@shared/stores/updateStore'
import { CacheableStore, UpdateInfoType, UpdateProgressType } from '@shared/types'
import EventEmitter from 'node:events'
import electronUpdater, { type AppUpdater } from 'electron-updater'
import Logger from '@server/utils/logger'
import { LOGGING_LEVELS } from '@deskthing/types'
import { handleError } from '@server/utils/errorHandler'
import { app } from 'electron'
import { lt, valid } from 'semver'
import { getServiceConfig } from '@server/config/serviceConfig'

type ReleaseNotes = string | { version: string; note: string | null }[] | null | undefined

const normalizeReleaseNotes = (notes: ReleaseNotes): string | undefined => {
  if (!notes) return undefined
  if (typeof notes === 'string') return notes
  return notes
    .map((entry) => entry.note)
    .filter((note): note is string => Boolean(note))
    .join('\n')
}

// Shown in the update panel, so prefer the plain message over a stack trace.
const describeError = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : handleError(error)

export class UpdateStore
  extends EventEmitter<UpdateStoreEvents>
  implements CacheableStore, UpdateStoreClass
{
  private _initialized = false
  private _updateStatus: UpdateInfoType | null = null
  private _updateProgress: UpdateProgressType | null = null
  private _autoUpdater: AppUpdater | null = null
  private _checkInProgress: Promise<string> | null = null
  private _downloadInProgress: Promise<void> | null = null

  get initialized(): boolean {
    return this._initialized
  }

  constructor() {
    super()

    // Defer initializing for a couple of seconds
    setTimeout(this.initialize, 5000)
  }

  clearCache: () => Promise<void> = async () => {}
  saveToFile: () => Promise<void> = async () => {}

  initialize = async (): Promise<void> => {
    if (this._initialized) return

    Logger.debug('Initializing update store', {
      source: 'UpdateStore',
      function: 'initialize'
    })

    const { updateFeedUrl } = getServiceConfig()
    if (!app.isPackaged) {
      Logger.debug('Application updates are disabled for development builds', {
        source: 'UpdateStore',
        function: 'initialize'
      })
      this._initialized = true
      return
    }

    if (!updateFeedUrl) {
      Logger.info('Application updates are disabled because no update feed is configured', {
        source: 'UpdateStore',
        function: 'initialize'
      })
      this._initialized = true
      return
    }

    const { autoUpdater } = electronUpdater
    this._autoUpdater = autoUpdater
    this._autoUpdater.setFeedURL({
      provider: 'generic',
      url: updateFeedUrl
    })
    this._autoUpdater.autoDownload = false
    this._autoUpdater.autoInstallOnAppQuit = true

    this._autoUpdater.logger = {
      info: (message): Promise<void> => Logger.info(message, { source: 'AutoUpdater' }),
      warn: (message): Promise<void> => Logger.warn(message, { source: 'AutoUpdater' }),
      error: (message): Promise<void> => Logger.error(message, { source: 'AutoUpdater' }),
      debug: (message): Promise<void> => Logger.debug(message, { source: 'AutoUpdater' })
    }

    this._autoUpdater.on('download-progress', (progressObj) => {
      const progress: UpdateProgressType = {
        percent: progressObj.percent,
        speed: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total
      }
      this.setUpdateProgress(progress)

      Logger.log(
        LOGGING_LEVELS.LOG,
        `Download progress: ${progress.percent}% - ${progress.speed} bytes/sec - ${progress.transferred}/${progress.total}`
      )
    })

    this._autoUpdater.on('update-downloaded', (info) => {
      Logger.log(LOGGING_LEVELS.LOG, 'Update downloaded: ' + JSON.stringify(info))
      const updateInfo: UpdateInfoType = {
        updateAvailable: true,
        updateDownloaded: true,
        version: info.version,
        releaseNotes: normalizeReleaseNotes(info.releaseNotes),
        releaseName: info.releaseName,
        releaseDate: info.releaseDate
      }
      this.setUpdateStatus(updateInfo)
    })

    this._autoUpdater.on('error', (error) => {
      this.reportFailure(error.message)
    })

    this._initialized = true
  }

  checkForUpdates = async (): Promise<string> => {
    if (this._checkInProgress) return this._checkInProgress

    this._checkInProgress = this.performUpdateCheck()
    try {
      return await this._checkInProgress
    } finally {
      this._checkInProgress = null
    }
  }

  private performUpdateCheck = async (): Promise<string> => {
    await this.initialize()

    if (!this._autoUpdater) {
      return app.isPackaged
        ? 'Application updates are not configured'
        : 'Application updates are disabled in development'
    }

    const appVersion = app.getVersion()

    try {
      const updateCheck = await this._autoUpdater.checkForUpdates()
      const latestVersion = updateCheck?.updateInfo.version
      // `lt` rather than a range check: ranges exclude prereleases, which would
      // stop a prerelease build from ever being offered its stable release.
      if (
        updateCheck &&
        valid(latestVersion) &&
        valid(appVersion) &&
        lt(appVersion, latestVersion!)
      ) {
        const updateInfo: UpdateInfoType = {
          updateAvailable: true,
          // A repeated check must not discard an update that is already downloaded.
          updateDownloaded:
            this._updateStatus?.updateDownloaded === true &&
            this._updateStatus.version === latestVersion,
          version: updateCheck.updateInfo.version,
          releaseNotes: normalizeReleaseNotes(updateCheck.updateInfo.releaseNotes),
          releaseName: updateCheck.updateInfo.releaseName,
          releaseDate: updateCheck.updateInfo.releaseDate
        }
        this.setUpdateStatus(updateInfo)
        return 'Update available'
      } else {
        const updateInfo: UpdateInfoType = {
          updateAvailable: false,
          updateDownloaded: false
        }
        this.setUpdateStatus(updateInfo)
        return 'No update available'
      }
    } catch (error) {
      return this.reportFailure(describeError(error))
    }
  }

  startDownload = async (): Promise<void> => {
    if (this._downloadInProgress) return this._downloadInProgress
    this._downloadInProgress = this.performDownload()
    try {
      await this._downloadInProgress
    } finally {
      this._downloadInProgress = null
    }
  }

  private performDownload = async (): Promise<void> => {
    await this.initialize()
    if (!this._autoUpdater) return

    try {
      if (!this._updateStatus?.updateAvailable) {
        await this.checkForUpdates()
      }

      if (!this._updateStatus?.updateAvailable) return
      if (this._updateStatus.updateDownloaded) return
      this._updateProgress = null
      this.setUpdateStatus({ ...this._updateStatus, failed: false, error: undefined })
      await this._autoUpdater.downloadUpdate()
    } catch (error) {
      this.reportFailure(describeError(error))
    }
  }

  /**
   * Marks the current update as failed while keeping the release details and
   * download state, so the UI can still describe the release and offer a retry.
   */
  private reportFailure = (message: string): string => {
    // electron-updater reports a failed download through both its `error` event
    // and the rejected promise; only surface it once.
    if (this._updateStatus?.failed && this._updateStatus.error === message) return message
    this.setUpdateStatus({
      updateAvailable: false,
      updateDownloaded: false,
      ...this._updateStatus,
      failed: true,
      error: message
    })
    this.emit('update-error', message)
    return message
  }

  quitAndInstall = (): void => {
    if (!this._autoUpdater || !this._updateStatus?.updateDownloaded) return
    this._autoUpdater.quitAndInstall()
  }

  getUpdateStatus = (): UpdateInfoType | null => {
    return this._updateStatus
  }

  getUpdateProgress = (): UpdateProgressType | null => {
    return this._updateProgress
  }

  setUpdateStatus = (status: UpdateInfoType): void => {
    this._updateStatus = status
    this.emit('update-status', status)
  }

  setUpdateProgress = (progress: UpdateProgressType): void => {
    this._updateProgress = progress
    this.emit('update-progress', progress)
  }
}
