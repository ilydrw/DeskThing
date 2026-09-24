import { powerMonitor } from 'electron'
import Logger from '@server/utils/logger'
import { storeProvider } from '@server/stores/storeProvider'
import { WebSocketPlatform } from './websocket/wsPlatform'
import { ADBPlatform } from './superbird/adbPlatform'
import { getDeviceConnectionOptions } from './platformConfig'

/** Gives USB devices and network interfaces time to come back after the host wakes. */
export const RESUME_RECHECK_DELAY_MS = 3000

export async function initializePlatforms(): Promise<void> {
  try {
    const platformStore = await storeProvider.getStore('platformStore')
    const settingsStore = await storeProvider.getStore('settingsStore')
    const connectionOptions = await getDeviceConnectionOptions(settingsStore)

    // Initialize WebSocket platform
    const wsPlatform = new WebSocketPlatform()
    const adbPlatform = new ADBPlatform()
    await platformStore.registerPlatform(wsPlatform)
    await platformStore.registerPlatform(adbPlatform)

    // Start the ws platform
    await platformStore.startPlatform(wsPlatform.id, connectionOptions)

    await platformStore.startPlatform(adbPlatform.id, {
      port: connectionOptions.port
    })

    // Sleep drops ADB reverse-port mappings and can leave half-open sockets behind.
    powerMonitor.on('resume', () => {
      Logger.info('Host resumed; re-checking device connections', {
        source: 'platformInitializer',
        function: 'resume'
      })
      setTimeout(() => {
        void Promise.allSettled([wsPlatform.checkConnections(), adbPlatform.checkConnections()])
      }, RESUME_RECHECK_DELAY_MS)
    })

    Logger.debug('Platforms initialized successfully', {
      source: 'platformInitializer',
      function: 'initializePlatforms'
    })
  } catch (error) {
    Logger.error('Failed to initialize platforms', {
      source: 'platformInitializer',
      function: 'initializePlatforms',
      error: error instanceof Error ? error : new Error(String(error))
    })
  }
}
