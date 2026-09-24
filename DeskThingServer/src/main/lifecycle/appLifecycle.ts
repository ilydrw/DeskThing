/**
 * Manages application lifecycle events
 */
import { app, BrowserWindow, NativeImage, nativeImage, Notification } from 'electron'
import { setupProtocolHandler } from '../system/protocol'
import { setupTray } from '../system/tray'
import { setupDock } from '../system/dock'
import { setupIpcHandlers } from '../ipc/ipcManager'
import { loadModules } from './moduleLoader'
import { closeLoadingWindow, buildMainWindow } from '../windows/windowManager'
import { updateLoadingStatus } from '@server/windows/loadingWindow'
import { join } from 'node:path'
import { checkFlag } from './lifecycleCheck'
import { createBeforeQuitHandler } from './shutdownHandler'

/**
 * Initialize the application lifecycle
 */
export async function initializeAppLifecycle(): Promise<void> {
  let afterStartupTimer: NodeJS.Timeout | undefined = undefined
  const persistBeforeQuit = async (): Promise<void> => {
    clearTimeout(afterStartupTimer)
    const { storeProvider } = await import('../stores/storeProvider')
    const { default: cacheManager } = await import('../services/utility/cacheManager')
    const { flushFileOperations } = await import('../services/files/fileService')
    const { default: logger } = await import('../utils/logger')
    const results = await Promise.allSettled([
      storeProvider.collectShutdownStats(),
      storeProvider.dispose()
    ])
    try {
      await cacheManager.hibernateAll()
    } finally {
      await flushFileOperations()
      await logger.flush()
    }
    const failures = results.filter((result) => result.status === 'rejected')
    if (failures.length) throw new AggregateError(failures.map((result) => result.reason), 'Some services failed to stop')
  }
  app.on('before-quit', createBeforeQuitHandler(persistBeforeQuit, () => app.quit()))
  // Set up protocol handler
  setupProtocolHandler()

  // Set up platform-specific UI elements
  if (process.platform === 'darwin') {
    setupDock()
  }

  setupTray()

  // Set app ID for Windows
  app.setAppUserModelId('com.deskthing')

  // Optimize window shortcuts
  app.on('browser-window-created', async (_, window) => {
    const { optimizer } = await import('@electron-toolkit/utils')
    optimizer.watchWindowShortcuts(window)
  })

  const startMinimized = await checkFlag('server_startMinimized')
  await setupIpcHandlers()
  await loadModules()
  // Create main window after loading is complete
  if (!startMinimized) {
    await updateLoadingStatus('Creating main window')
    const mainWindow = buildMainWindow()
    mainWindow.once('ready-to-show', async () => {
      await updateLoadingStatus('Finishing Up...')
      closeLoadingWindow()
      mainWindow.show()
    })
  }

  if (startMinimized) closeLoadingWindow()

  afterStartupTimer = setTimeout(async () => {
    try {
      const { afterStartTasks } = await import('@server/services/initialization/AfterStartupTasks')

      await afterStartTasks()
    } catch (error) {
      console.error('Failed to run startup tasks', error)
    }
  }, 10000)

  // Handle window recreation on macOS
  app.on('activate', function () {
    console.log('Handling recreation on MacOS')
    const windows = BrowserWindow.getAllWindows()
    if (windows.length === 0) {
      buildMainWindow()
    } else {
      console.log(
        `Not creating due to ${windows.length} already existing. The window is `,
        windows.map((w) => w.getTitle())
      )
    }
  })

  // Handle window closure
  app.on('window-all-closed', async () => {
    try {
    const { storeProvider } = await import('../stores/storeProvider')
    const settingsStore = await storeProvider.getStore('settingsStore')
    const settings = await settingsStore.getSettings()

    if (settings?.flag_firstClose === true) {
      let trayIcon: NativeImage
      if (process.platform === 'darwin') {
        trayIcon = nativeImage.createFromPath(join(__dirname, '../../resources/iconTrayMacSm.png'))
      } else {
        trayIcon = nativeImage.createFromPath(join(__dirname, '../../resources/iconTray.png'))
      }

      new Notification({
        title: 'DeskThing is now in the background!',
        body: 'DeskThing will continue to work.',
        icon: trayIcon
      }).show()
      await settingsStore.saveSetting('flag_firstClose', false)
    }

    if (settings?.server_minimizeApp) {
      // Device and music services continue running while the UI is hidden.
      await storeProvider.saveAllToFile()
    } else {
      app.quit()
    }
    } catch (error) {
      console.error('Failed to handle window closure', error)
    }
  })
}
