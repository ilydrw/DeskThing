/**
 * Main entry point for the Electron application.
 * Handles window creation, IPC communication, tray/dock setup, and application lifecycle.
 *
 * Features:
 * - Creates and manages main application window and client windows
 * - Sets up system tray and dock menu integration
 * - Handles custom protocol (deskthing://) for deep linking
 * - Manages IPC communication between main and renderer processes
 * - Implements single instance locking
 * - Handles application lifecycle events
 * - Manages module loading and initialization
 */

/**
 * Main entry point for the Electron application.
 * Delegates responsibilities to specialized modules.
 */
import { app } from 'electron'
import { setupSingleInstance } from './system/singleInstance'
import { initializeAppLifecycle } from './lifecycle/appLifecycle'
import { buildLoadingWindow } from './windows/windowManager'
import { initializationCheck } from './services/initialize'

// Initialize environment variables
import './utils/environment'

// Ensure single instance
if (!setupSingleInstance()) {
  app.quit()
} else {
  // Application initialization
  app.whenReady().then(async () => {
    // Show loading window first
    const loadingWindow = await buildLoadingWindow()

    loadingWindow.once('ready-to-show', async () => {
      loadingWindow.show()
      try {
        await initializationCheck()
        await initializeAppLifecycle()
      } catch (error) {
        console.error('Application startup failed', error)
        const { updateLoadingStatus } = await import('./windows/loadingWindow')
        await updateLoadingStatus('Startup failed. See the application log for details.')
      }
    })
  }).catch((error) => {
    console.error('Unable to create the application window', error)
    app.quit()
  })
}
