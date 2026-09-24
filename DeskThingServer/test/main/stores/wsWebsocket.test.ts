import { describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import { WSPlatform } from '@server/stores/platforms/websocket/wsWebsocket'
import {
  ConnectionState,
  DESKTHING_DEVICE,
  PlatformIDs,
  ProviderCapabilities,
  type Client
} from '@deskthing/types'

describe('WSPlatform connection health', () => {
  it('removes a stale client before attempting to send data', async () => {
    const platform = new WSPlatform('test-user-data')
    const client: Client = {
      clientId: 'client-a',
      connected: true,
      connectionState: ConnectionState.Connected,
      primaryProviderId: PlatformIDs.WEBSOCKET,
      timestamp: Date.now(),
      identifiers: {
        [PlatformIDs.WEBSOCKET]: {
          id: 'client-a',
          providerId: PlatformIDs.WEBSOCKET,
          active: true,
          capabilities: [ProviderCapabilities.COMMUNICATE, ProviderCapabilities.PING],
          connectionState: ConnectionState.Connected
        }
      },
      meta: {
        [PlatformIDs.WEBSOCKET]: {
          wsId: 'client-a'
        }
      }
    }
    const socket = {
      readyState: WebSocket.CLOSED,
      terminate: vi.fn()
    } as unknown as WebSocket

    const clients = (
      platform as unknown as {
        clients: Map<string, { client: Client; socket: WebSocket }>
      }
    ).clients
    clients.set(client.clientId, { client, socket })

    const sent = await platform.sendData(client.clientId, {
      type: DESKTHING_DEVICE.PING,
      payload: client.clientId,
      app: 'client'
    })

    expect(sent).toBe(false)
    expect(platform.getClients()).toEqual([])
  })

  it('tolerates one missed health check before disconnecting', async () => {
    const platform = new WSPlatform('test-user-data')
    const client: Client = {
      clientId: 'client-a',
      connected: true,
      connectionState: ConnectionState.Connected,
      primaryProviderId: PlatformIDs.WEBSOCKET,
      timestamp: Date.now(),
      identifiers: {
        [PlatformIDs.WEBSOCKET]: {
          id: 'client-a',
          providerId: PlatformIDs.WEBSOCKET,
          active: true,
          capabilities: [ProviderCapabilities.COMMUNICATE, ProviderCapabilities.PING],
          connectionState: ConnectionState.Connected
        }
      },
      meta: {}
    }
    const socket = { readyState: WebSocket.OPEN } as WebSocket
    const internal = platform as unknown as {
      clients: Map<string, { client: Client; socket: WebSocket }>
      runHealthCheck(): Promise<void>
    }
    internal.clients.set(client.clientId, { client, socket })
    vi.spyOn(platform, 'pingClient').mockResolvedValue({})
    const disconnect = vi.spyOn(platform, 'handleClientDisconnected').mockResolvedValue()

    await internal.runHealthCheck()
    expect(disconnect).not.toHaveBeenCalled()

    await internal.runHealthCheck()
    expect(disconnect).toHaveBeenCalledWith(client.clientId)
  })

  it('replaces a stale socket without changing the device id', () => {
    const platform = new WSPlatform('test-user-data')
    const client: Client = {
      clientId: 'client-a',
      connected: true,
      connectionState: ConnectionState.Connected,
      primaryProviderId: PlatformIDs.WEBSOCKET,
      timestamp: Date.now(),
      identifiers: {
        [PlatformIDs.WEBSOCKET]: {
          id: 'client-a',
          providerId: PlatformIDs.WEBSOCKET,
          active: true,
          connectionState: ConnectionState.Connected
        }
      },
      meta: {}
    }
    const staleSocket = { terminate: vi.fn() } as unknown as WebSocket
    const replacementSocket = { terminate: vi.fn() } as unknown as WebSocket
    const internal = platform as unknown as {
      clients: Map<string, { client: Client; socket: WebSocket }>
      replaceClientConnection(clientId: string, client: Client, socket: WebSocket): void
    }
    internal.clients.set(client.clientId, { client, socket: staleSocket })

    internal.replaceClientConnection(client.clientId, client, replacementSocket)

    expect(staleSocket.terminate).toHaveBeenCalledOnce()
    expect(internal.clients.get(client.clientId)?.socket).toBe(replacementSocket)
  })
})
