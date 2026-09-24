import { UpdateStoreClass, UpdateStoreEvents } from '@shared/stores/updateStore'
import { CacheableStore, UpdateInfoType, UpdateProgressType } from '@shared/types'
import EventEmitter from 'node:events'
import electronUpdater, { type AppUpdater } from 'electron-updater'
import Logger from '@server/utils/logger'
import { LOGGING_LEVELS } from '@deskthing/types'
import { handleError } from '@server/utils/errorHandler'
import { app } from 'electron'
import { satisfies } from 'semver'
import { getServiceConfig } from '@server/config/serviceConfig'

export class UpdateStore
  extends EventEmitter<UpdateStoreEvents>
  implements CacheableStore, UpdateStoreClass
{
  private _initialized = false
  private _updateStatus: UpdateInfoType | null = null
  private _updateProgress: UpdateProgressType | null = null
  private _autoUpdater: AppUpdater | null = null
  private _checkInProgress: Promise<string> | null = null

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
        releaseNotes: info.releaseNotes as string,
        releaseName: info.releaseName,
        releaseDate: info.releaseDate
      }
      this.setUpdateStatus(updateInfo)
    })

    this._autoUpdater.on('error', (error) => {
      const errorStatus: UpdateInfoType = {
        updateAvailable: false,
        updateDownloaded: false,
        failed: true,
        error: error.message
      }
      this.setUpdateStatus(errorStatus)
      this.emit('update-error', error.message)
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
      if (updateCheck && satisfies(appVersion, `<${updateCheck.updateInfo.version}`)) {
        const updateInfo: UpdateInfoType = {
          updateAvailable: true,
          updateDownloaded: false,
          version: updateCheck.updateInfo.version,
          releaseNotes: updateCheck.updateInfo.releaseNotes as string,
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
      const errorMessage = handleError(error)
      const errorStatus: UpdateInfoType = {
        updateAvailable: false,
        updateDownloaded: false,
        failed: true,
        error: errorMessage
      }
      this.setUpdateStatus(errorStatus)
      this.emit('update-error', errorMessage)
      return errorMessage
    }
  }

  startDownload = async (): Promise<void> => {
    await this.initialize()
    if (!this._autoUpdater) return

    try {
      if (!this._updateStatus?.updateAvailable) {
        await this.checkForUpdates()
      }

      if (!this._updateStatus?.updateAvailable) return
      await this._autoUpdater.downloadUpdate()
    } catch (error) {
      const errorMessage = handleError(error)
      const errorStatus: UpdateInfoType = {
        updateAvailable: true,
        updateDownloaded: false,
        failed: true,
        error: errorMessage
      }
      this.setUpdateStatus(errorStatus)
      this.emit('update-error', errorMessage)
    }
  }

  quitAndInstall = (): void => {
    if (!this._autoUpdater) return
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
