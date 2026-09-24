import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlatformIDs } from '@deskthing/types'

const mocks = vi.hoisted(() => ({
  getSetting: vi.fn(),
  getStore: vi.fn(),
  registerPlatform: vi.fn(),
  startPlatform: vi.fn(),
  powerOn: vi.fn(),
  wsCheck: vi.fn(),
  adbCheck: vi.fn()
}))

vi.mock('electron', () => ({
  powerMonitor: { on: mocks.powerOn }
}))

vi.mock('@server/stores/storeProvider', () => ({
  storeProvider: {
    getStore: mocks.getStore
  }
}))

vi.mock('@server/stores/platforms/websocket/wsPlatform', () => ({
  WebSocketPlatform: class {
    id = 'websocket'
    checkConnections = mocks.wsCheck
  }
}))

vi.mock('@server/stores/platforms/superbird/adbPlatform', () => ({
  ADBPlatform: class {
    id = 'adb'
    checkConnections = mocks.adbCheck
  }
}))

vi.mock('@server/utils/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn()
  }
}))

import {
  initializePlatforms,
  RESUME_RECHECK_DELAY_MS
} from '@server/stores/platforms/platformInitializer'

describe('initializePlatforms', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSetting.mockImplementation(async (key: string) => {
      if (key === 'device_address') return '127.0.0.1'
      if (key === 'device_devicePort') return 18991
      return undefined
    })
    mocks.registerPlatform.mockResolvedValue(undefined)
    mocks.startPlatform.mockResolvedValue(true)
    mocks.getStore.mockImplementation(async (name: string) => {
      if (name === 'settingsStore') {
        return { getSetting: mocks.getSetting }
      }
      return {
        registerPlatform: mocks.registerPlatform,
        startPlatform: mocks.startPlatform
      }
    })
  })

  it('starts network and ADB platforms with the configured device endpoint', async () => {
    await initializePlatforms()

    expect(mocks.registerPlatform).toHaveBeenCalledTimes(2)
    expect(mocks.startPlatform).toHaveBeenNthCalledWith(1, PlatformIDs.WEBSOCKET, {
      address: '127.0.0.1',
      port: 18991
    })
    expect(mocks.startPlatform).toHaveBeenNthCalledWith(2, PlatformIDs.ADB, {
      port: 18991
    })
  })

  it('re-checks both transports after the host resumes from sleep', async () => {
    vi.useFakeTimers()
    try {
      await initializePlatforms()
      const [event, onResume] = mocks.powerOn.mock.calls[0]
      expect(event).toBe('resume')

      onResume()
      expect(mocks.wsCheck).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(RESUME_RECHECK_DELAY_MS)

      expect(mocks.wsCheck).toHaveBeenCalledOnce()
      expect(mocks.adbCheck).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})
