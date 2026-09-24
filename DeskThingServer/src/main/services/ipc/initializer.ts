import logger from '@server/utils/logger'
import { updateLoadingStatus } from '@server/windows/loadingWindow'
import {
  IPC_HANDLERS, AppIPCData, IPC_APP_TYPES, ClientIPCData, UtilityIPCData, PlatformIPC,
  IPC_CLIENT_TYPES, IPC_UTILITY_TYPES, DeviceIPCData, FeedbackIPCData, ReleaseIPCData,
  TaskIPCData, UpdateIPCData, IPC_DEVICE_TYPES
} from '@shared/types'
import { validateIpcData } from './ipcValidation'
import { isTrustedIpcSender } from '@server/windows/rendererSecurity'

export const initializeIpcHandlers = async (ipcMain: Electron.IpcMain): Promise<void> => {
  await updateLoadingStatus('Setting up IPC handlers...')

  const register = <Data>(
    channel: IPC_HANDLERS,
    handler: (event: Electron.IpcMainInvokeEvent, data: Data) => Promise<unknown>
  ): void => {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, data: unknown) => {
      try {
        if (!isTrustedIpcSender(event)) throw new Error('IPC sender is not the main application frame')
        validateIpcData(channel, data)
        // The envelope and operation payload have been checked before dispatch.
        return await handler(event, data as Data)
      } catch (error) {
        logger.error('IPC request failed on channel ' + channel, {
          source: 'ipcHandlers', function: channel, error: error instanceof Error ? error : new Error(String(error))
        })
        throw new Error('Request failed on ' + channel + '. See the application log for details.')
      }
    })
  }

  register<AppIPCData>(IPC_HANDLERS.APPS, async <T extends IPC_APP_TYPES>(_event: unknown, data: Extract<AppIPCData, { type: T }>) => {
    const { appHandler } = await import('./appIpc')
    return appHandler[data.type](data)
  })
  register<ClientIPCData>(IPC_HANDLERS.CLIENT, async <T extends IPC_CLIENT_TYPES>(_event: unknown, data: Extract<ClientIPCData, { type: T }>) => {
    const { clientHandler } = await import('./clientIpc')
    return clientHandler[data.type](data)
  })
  register<UtilityIPCData>(IPC_HANDLERS.UTILITY, async <T extends IPC_UTILITY_TYPES>(_event: unknown, data: Extract<UtilityIPCData, { type: T }>) => {
    const { utilityHandler } = await import('./utilityIpc')
    return utilityHandler[data.type](data)
  })
  register<DeviceIPCData>(IPC_HANDLERS.DEVICE, async <T extends IPC_DEVICE_TYPES>(_event: unknown, data: Extract<DeviceIPCData, { type: T }>) => {
    const { deviceHandler } = await import('./deviceIpc')
    return deviceHandler[data.type](data)
  })
  register(IPC_HANDLERS.PLATFORM, async (_event: unknown, data: PlatformIPC) => {
    const { platformHandler } = await import('./platformIpc')
    return platformHandler(data)
  })
  register(IPC_HANDLERS.FEEDBACK, async (_event: unknown, data: FeedbackIPCData) => {
    const { feedbackHandler } = await import('./feedbackIpc')
    return feedbackHandler(data)
  })
  register(IPC_HANDLERS.RELEASE, async (_event: unknown, data: ReleaseIPCData) => {
    const { releaseHandler } = await import('./releasesIpc')
    return releaseHandler(data)
  })
  register(IPC_HANDLERS.TASK, async (_event: unknown, data: TaskIPCData) => {
    const { taskHandler } = await import('./taskIpc')
    return taskHandler(data)
  })
  register(IPC_HANDLERS.UPDATE, async (_event: unknown, data: UpdateIPCData) => {
    const { updateHandler } = await import('./updateIpc')
    return updateHandler(data)
  })
}
