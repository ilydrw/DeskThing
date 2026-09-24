import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client, ConnectionState, PlatformIDs } from '@deskthing/types'
import useClientStore from '@renderer/stores/clientStore'
import type { IpcRendererCallback } from '@shared/types'

const online: Client = {
  clientId: 'display',
  connected: true,
  connectionState: ConnectionState.Connected,
  primaryProviderId: PlatformIDs.WEBSOCKET,
  timestamp: 1,
  identifiers: {},
  meta: {}
}
const discovered: Client = {
  clientId: 'usb',
  connected: false,
  connectionState: ConnectionState.Established,
  identifiers: {},
  meta: {}
}
const on = vi.fn()
const getConnections = vi.fn()
const refreshConnections = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  useClientStore.setState(useClientStore.getInitialState(), true)
  vi.stubGlobal('window', {
    electron: {
      ipcRenderer: { on },
      client: { getClientManifest: vi.fn(), getKnownDevices: vi.fn().mockResolvedValue([]) },
      utility: { getConnections },
      platform: { refreshConnections }
    }
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('connected-device counts', () => {
  it('keeps discovered devices visible without reporting them as connected', async () => {
    getConnections.mockResolvedValue([online, discovered])
    await useClientStore.getState().requestConnections()
    expect(useClientStore.getState().connections).toBe(1)
    expect(useClientStore.getState().clients).toHaveLength(2)
    refreshConnections.mockResolvedValue([discovered])
    await useClientStore.getState().refreshConnections()
    expect(useClientStore.getState().connections).toBe(0)
  })

  it('recounts after snapshots, discovery, connection, failure, and removal', async () => {
    await useClientStore.getState().initialize()
    const snapshot: (_event: unknown, data: Parameters<IpcRendererCallback<'clients'>>[1]) => void =
      on.mock.calls.find(([name]) => name === 'clients')?.[1]
    const event: (
      _event: unknown,
      data: Parameters<IpcRendererCallback<'platform:client'>>[1]
    ) => void = on.mock.calls.find(([name]) => name === 'platform:client')?.[1]
    snapshot({}, [online, discovered])
    expect(useClientStore.getState().connections).toBe(1)
    event({}, { request: 'list', clients: [discovered] })
    expect(useClientStore.getState().connections).toBe(0)
    event({}, { request: 'added', client: online })
    event({}, { request: 'added', client: online })
    expect(useClientStore.getState().connections).toBe(1)
    expect(useClientStore.getState().clients).toHaveLength(2)
    event(
      {},
      { request: 'modified', client: { ...online, connectionState: ConnectionState.Failed } }
    )
    expect(useClientStore.getState().connections).toBe(0)
    event({}, { request: 'modified', client: online })
    expect(useClientStore.getState().connections).toBe(1)
    event({}, { request: 'removed', clientId: online.clientId })
    expect(useClientStore.getState().connections).toBe(0)
    expect(useClientStore.getState().clients).toEqual([discovered])
  })
})
