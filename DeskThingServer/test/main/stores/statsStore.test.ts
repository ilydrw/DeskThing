import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StatsStore } from '@server/stores/statsStore'
import { SettingsStoreClass, SettingsStoreListener } from '@shared/stores/settingsStore'

const mocks = vi.hoisted(() => ({
  getMachineId: vi.fn(),
  getServiceConfig: vi.fn(),
  readPrivateKey: vi.fn(),
  createClient: vi.fn(),
  register: vi.fn(),
  send: vi.fn()
}))

vi.mock('@server/utils/machineId', () => ({
  getMachineId: mocks.getMachineId
}))

vi.mock('@server/config/serviceConfig', () => ({
  getServiceConfig: mocks.getServiceConfig
}))

vi.mock('@server/services/stats/statsFetchWrapper', () => ({
  DeskThingStats: class {
    static readPrivateKey = mocks.readPrivateKey

    constructor(...args: unknown[]) {
      mocks.createClient(...args)
    }

    register = mocks.register
    send = mocks.send
  }
}))

vi.mock('@server/utils/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  }
}))

describe('StatsStore', () => {
  let store: StatsStore | null = null
  let settingListener: SettingsStoreListener<'flag_collectStats'> | null = null
  let settingsStore: SettingsStoreClass
  let originalNodeEnv: string | undefined

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    mocks.getMachineId.mockResolvedValue({
      clientId: 'client-id',
      privateKey: 'private-key',
      publicKey: 'public-key'
    })
    mocks.getServiceConfig.mockReturnValue({
      statsUrl: null,
      feedbackUrl: null,
      supporterToken: null
    })
    mocks.readPrivateKey.mockResolvedValue({} as CryptoKey)
    mocks.register.mockResolvedValue({ success: true, status: 200 })
    mocks.send.mockResolvedValue({ success: true, status: 200 })

    settingsStore = {
      initialized: true,
      initialize: vi.fn(),
      clearCache: vi.fn(),
      saveToFile: vi.fn(),
      addSettingsListener: vi.fn(),
      getSetting: vi.fn().mockResolvedValue(false),
      saveSetting: vi.fn(),
      saveSettings: vi.fn(),
      getSettings: vi.fn(),
      setFlag: vi.fn(),
      toggleFlag: vi.fn(),
      getFlag: vi.fn(),
      on: vi.fn((_key, listener) => {
        settingListener = listener as SettingsStoreListener<'flag_collectStats'>
        return vi.fn()
      })
    }
  })

  afterEach(() => {
    store?.dispose()
    store = null
    settingListener = null
    process.env.NODE_ENV = originalNodeEnv
    vi.clearAllMocks()
  })

  it('does not identify the machine or queue data while diagnostics are disabled', async () => {
    store = new StatsStore(settingsStore)
    await store.initialize()
    await store.collect({
      stat: 'usage',
      type: 'open',
      data: { timezone: 'UTC' }
    })
    await store.saveToFile()

    expect(mocks.getMachineId).not.toHaveBeenCalled()
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.register).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('does not identify the machine when a user opts in without a configured service', async () => {
    vi.mocked(settingsStore.getSetting).mockResolvedValue(true)

    store = new StatsStore(settingsStore)
    await store.initialize()

    expect(mocks.getMachineId).not.toHaveBeenCalled()
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('registers only after opt-in when a statistics service is configured', async () => {
    mocks.getServiceConfig.mockReturnValue({
      statsUrl: 'https://stats.example.test',
      feedbackUrl: null,
      supporterToken: null
    })

    store = new StatsStore(settingsStore)
    await store.initialize()
    expect(settingListener).not.toBeNull()

    await settingListener?.(true)

    expect(mocks.createClient).toHaveBeenCalledWith('client-id', expect.anything(), {
      baseUrl: 'https://stats.example.test'
    })
    expect(mocks.register).toHaveBeenCalledOnce()
  })

  it('discards queued diagnostics immediately when the user opts out', async () => {
    mocks.getServiceConfig.mockReturnValue({
      statsUrl: 'https://stats.example.test',
      feedbackUrl: null,
      supporterToken: null
    })
    vi.mocked(settingsStore.getSetting).mockResolvedValue(true)

    store = new StatsStore(settingsStore)
    await store.initialize()
    await store.collect({
      stat: 'usage',
      type: 'open',
      data: { timezone: 'UTC' }
    })

    await settingListener?.(false)
    await store.saveToFile()

    expect(mocks.send).not.toHaveBeenCalled()
  })
})
