import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlatformEvent } from '@shared/interfaces/platformInterface'

const mocks = vi.hoisted(() => ({
  getDevices: vi.fn(),
  openPort: vi.fn(),
  getDeviceVersion: vi.fn(),
  getDeviceUSID: vi.fn(),
  getDeviceMacBT: vi.fn(),
  getDeviceBrightness: vi.fn(),
  getSupervisorStatus: vi.fn(),
  getDeviceManifest: vi.fn(),
  getSetting: vi.fn(),
  settingsCleanup: vi.fn(),
  settingsOn: vi.fn(),
  updateManifest: vi.fn()
}))

vi.mock('@server/stores/platforms/superbird/adbService', () => ({
  ADBService: class {
    getDevices = mocks.getDevices
    openPort = mocks.openPort
    getDeviceVersion = mocks.getDeviceVersion
    getDeviceUSID = mocks.getDeviceUSID
    getDeviceMacBT = mocks.getDeviceMacBT
    getDeviceBrightness = mocks.getDeviceBrightness
    getSupervisorStatus = mocks.getSupervisorStatus
    getDeviceManifest = mocks.getDeviceManifest
  }
}))

vi.mock('@server/stores/storeProvider', () => ({
  storeProvider: {
    getStore: vi.fn().mockResolvedValue({
      getSetting: mocks.getSetting,
      on: mocks.settingsOn
    })
  }
}))

vi.mock('@server/services/events/progressBus', () => ({
  progressBus: {
    start: vi.fn(() => vi.fn()),
    startOperation: vi.fn(),
    update: vi.fn(),
    incrementProgress: vi.fn(),
    complete: vi.fn(),
    error: vi.fn()
  }
}))

vi.mock('@server/services/client/clientService', () => ({
  updateManifest: mocks.updateManifest
}))

vi.mock('@server/utils/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import { ADBPlatform } from '@server/stores/platforms/superbird/adbPlatform'

describe('ADBPlatform health recovery', () => {
  let platform: ADBPlatform

  beforeEach(() => {
    vi.useFakeTimers()
    mocks.getDevices.mockResolvedValue(['device-a'])
    mocks.openPort.mockResolvedValue(undefined)
    mocks.getDeviceVersion.mockResolvedValue('1.0.0')
    mocks.getDeviceUSID.mockResolvedValue('usid')
    mocks.getDeviceMacBT.mockResolvedValue('00:00:00:00:00:00')
    mocks.getDeviceBrightness.mockResolvedValue(50)
    mocks.getSupervisorStatus.mockResolvedValue({})
    mocks.getDeviceManifest.mockResolvedValue(null)
    mocks.getSetting.mockResolvedValue(true)
    mocks.settingsOn.mockReturnValue(mocks.settingsCleanup)
    platform = new ADBPlatform()
  })

  afterEach(async () => {
    await platform.stop()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('refreshes when a same-count replacement device appears', async () => {
    await platform.start({ port: 8891 })
    mocks.getDevices.mockResolvedValue(['device-b'])

    await (
      platform as unknown as {
        runHealthCheck(): Promise<void>
      }
    ).runHealthCheck()

    expect(platform.getClients().map((client) => client.clientId)).toEqual(['device-b'])
  })

  it('requires three missed checks before disconnecting a device', async () => {
    await platform.start({ port: 8891 })
    const disconnected = vi.fn()
    platform.on(PlatformEvent.CLIENT_DISCONNECTED, disconnected)
    mocks.getDevices.mockResolvedValue([])
    const runHealthCheck = (): Promise<void> =>
      (platform as unknown as { runHealthCheck(): Promise<void> }).runHealthCheck()

    await runHealthCheck()
    await runHealthCheck()
    expect(platform.getClients()).toHaveLength(1)
    expect(disconnected).not.toHaveBeenCalled()

    await runHealthCheck()
    expect(platform.getClients()).toHaveLength(0)
    expect(disconnected).toHaveBeenCalledOnce()
  })

  it('does not overlap health checks while ADB is slow', async () => {
    await platform.start({ port: 8891 })
    mocks.getDevices.mockClear()
    let release: (devices: string[]) => void = () => undefined
    mocks.getDevices.mockReturnValueOnce(new Promise<string[]>((resolve) => (release = resolve)))
    const runHealthCheck = (): Promise<void> =>
      (platform as unknown as { runHealthCheck(): Promise<void> }).runHealthCheck()

    const first = runHealthCheck()
    await runHealthCheck()
    release(['device-a'])
    await first

    expect(mocks.getDevices).toHaveBeenCalledOnce()
  })

  it('restores reverse ports immediately when asked to re-check connections', async () => {
    await platform.start({ port: 8891 })
    mocks.openPort.mockClear()

    await platform.checkConnections()

    expect(mocks.openPort).toHaveBeenCalledWith('device-a', 8891)
  })

  it('retains other devices during a forced client refresh', async () => {
    mocks.getDevices.mockResolvedValue(['device-a', 'device-b'])
    await platform.start({ port: 8891 })

    await platform.refreshClient('device-a', true, false)

    expect(
      platform
        .getClients()
        .map((client) => client.clientId)
        .sort()
    ).toEqual(['device-a', 'device-b'])
  })

  it('does not probe or reconfigure devices when auto detection is disabled', async () => {
    mocks.getSetting.mockResolvedValue(false)

    await platform.start({ port: 8891 })
    await platform.checkConnections()

    expect(mocks.getDevices).not.toHaveBeenCalled()
    expect(mocks.openPort).not.toHaveBeenCalled()
  })

  it('routes staged manifest updates through the shared persistence service', async () => {
    const manifest = { connectionId: 'updated-device' }
    mocks.updateManifest.mockResolvedValue(undefined)

    await platform.handlePlatformEvent({
      platform: 'adb',
      type: 'set',
      request: 'manifest',
      manifest
    } as Parameters<ADBPlatform['handlePlatformEvent']>[0])

    expect(mocks.updateManifest).toHaveBeenCalledOnce()
    expect(mocks.updateManifest).toHaveBeenCalledWith(manifest)
  })
})
