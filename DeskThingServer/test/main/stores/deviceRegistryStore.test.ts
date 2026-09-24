import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Client, ConnectionState, PlatformIDs, ProviderCapabilities } from '@deskthing/types'

const fileMocks = vi.hoisted(() => ({
  readFromFile: vi.fn(),
  writeToFile: vi.fn()
}))

vi.mock('@server/services/files/fileService', () => fileMocks)

vi.mock('@server/utils/logger', () => ({
  default: {
    error: vi.fn()
  }
}))

import { DeviceRegistryStore } from '@server/stores/deviceRegistryStore'

const createClient = (
  clientId: string,
  platformId: PlatformIDs,
  identifier: string,
  usid?: string
): Client => ({
  clientId,
  connected: true,
  connectionState: ConnectionState.Connected,
  primaryProviderId: platformId,
  timestamp: Date.now(),
  identifiers: {
    [platformId]: {
      id: identifier,
      providerId: platformId,
      active: true,
      capabilities: [ProviderCapabilities.PING],
      connectionState: ConnectionState.Connected
    }
  },
  meta: usid
    ? {
        [PlatformIDs.ADB]: {
          adbId: identifier,
          usid
        }
      }
    : {}
})

describe('DeviceRegistryStore', () => {
  beforeEach(() => {
    fileMocks.readFromFile.mockResolvedValue(undefined)
    fileMocks.writeToFile.mockResolvedValue(undefined)
    vi.clearAllMocks()
  })

  it('allows startup and new connections after an unreadable registry', async () => {
    fileMocks.readFromFile.mockRejectedValueOnce(new Error('EACCES: registry unreadable'))
    const store = new DeviceRegistryStore()
    await expect(store.initialize()).resolves.toBeUndefined()
    expect(store.initialized).toBe(true)
    expect(store.getDevices()).toEqual([])
    store.registerClient(createClient('new-device', PlatformIDs.WEBSOCKET, 'new-device'))
    expect(store.getDevices()).toHaveLength(1)
  })

  it('coalesces concurrent initialization', async () => {
    const store = new DeviceRegistryStore()
    await Promise.all([store.initialize(), store.initialize(), store.initialize()])
    expect(fileMocks.readFromFile).toHaveBeenCalledTimes(1)
  })

  it('keeps one canonical device across ADB and WebSocket identifiers', async () => {
    const store = new DeviceRegistryStore()
    await store.initialize()

    const adbDevice = store.registerClient(
      createClient('adb-serial', PlatformIDs.ADB, 'adb-serial', 'hardware-usid')
    )
    const websocketDevice = store.registerClient(
      createClient('websocket-session', PlatformIDs.WEBSOCKET, 'hardware-usid')
    )

    expect(websocketDevice.id).toBe(adbDevice.id)
    expect(store.getDevices()).toHaveLength(1)
    expect(store.getDevices()[0].identifiers).toMatchObject({
      adb: 'adb-serial',
      websocket: 'hardware-usid',
      usid: 'hardware-usid'
    })
  })

  it('persists a sanitized friendly name and can forget by provider identifier', async () => {
    const store = new DeviceRegistryStore()
    await store.initialize()
    store.registerClient(createClient('adb-serial', PlatformIDs.ADB, 'adb-serial'))

    const renamed = await store.renameDevice('adb-serial', '  Kitchen\n  Display  ')

    expect(renamed?.displayName).toBe('Kitchen Display')
    expect(fileMocks.writeToFile).toHaveBeenCalled()
    await expect(store.forgetDevice('adb-serial')).resolves.toBe(true)
    expect(store.getDevices()).toEqual([])
  })
})
