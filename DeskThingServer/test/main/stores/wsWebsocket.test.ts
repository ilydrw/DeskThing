import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import type { IncomingMessage } from 'node:http'
import WebSocket from 'ws'
import { PlatformEvent } from '@shared/interfaces/platformInterface'
import { WSPlatform } from '@server/stores/platforms/websocket/wsWebsocket'
import {
  ConnectionState,
  DESKTHING_DEVICE,
  DEVICE_DESKTHING,
  PlatformIDs,
  ProviderCapabilities,
  type Client
} from '@deskthing/types'

type HealthInternals = {
  clients: Map<string, { client: Client; socket: WebSocket }>
  lastActivity: WeakMap<WebSocket, number>
  lastHealthCheck: number
  runHealthCheck(): Promise<void>
}

const connectedClient = (clientId: string): Client => ({
  clientId,
  connected: true,
  connectionState: ConnectionState.Connected,
  primaryProviderId: PlatformIDs.WEBSOCKET,
  timestamp: Date.now(),
  identifiers: {
    [PlatformIDs.WEBSOCKET]: {
      id: clientId,
      providerId: PlatformIDs.WEBSOCKET,
      active: true,
      capabilities: [ProviderCapabilities.COMMUNICATE, ProviderCapabilities.PING],
      connectionState: ConnectionState.Connected
    }
  },
  meta: {}
})

const setupSession = (
  lastActivity: number
): {
  platform: WSPlatform
  socket: { readyState: number; ping: ReturnType<typeof vi.fn> }
  internal: HealthInternals
} => {
  const platform = new WSPlatform('test-user-data')
  const internal = platform as unknown as HealthInternals
  const socket = { readyState: WebSocket.OPEN, ping: vi.fn() }
  internal.clients.set('client-a', {
    client: connectedClient('client-a'),
    socket: socket as unknown as WebSocket
  })
  internal.lastActivity.set(socket as unknown as WebSocket, lastActivity)
  return { platform, socket, internal }
}

/** Behaves like the DeskThing client: answers pings, manifest requests, and app pings. */
class FakeDeviceSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN
  ping = vi.fn(() => setImmediate(() => this.emit('pong')))
  pong = vi.fn()
  close = vi.fn()
  terminate = vi.fn(() => {
    this.readyState = WebSocket.CLOSED
  })
  send = vi.fn((raw: string, callback?: (error?: Error) => void) => {
    const message = JSON.parse(raw)
    if (message.request === 'manifest') {
      this.receive({
        type: DEVICE_DESKTHING.MANIFEST,
        app: 'client',
        payload: { connectionId: 'device-1' }
      })
    } else if (message.type === DESKTHING_DEVICE.PING) {
      this.receive({ type: DEVICE_DESKTHING.PONG, app: 'client' })
    }
    callback?.()
  })

  receive(message: Record<string, unknown>): void {
    setImmediate(() => this.emit('message', Buffer.from(JSON.stringify(message))))
  }
}

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

  it('keeps a busy client whose network stack still answers pings', async () => {
    const { platform, socket, internal } = setupSession(Date.now() - 20000)
    const disconnect = vi.spyOn(platform, 'handleClientDisconnected').mockResolvedValue()

    await internal.runHealthCheck()

    expect(disconnect).not.toHaveBeenCalled()
    expect(socket.ping).toHaveBeenCalledOnce()
  })

  it('closes a session that has been silent past the timeout', async () => {
    const { platform, internal } = setupSession(Date.now() - 60000)
    const disconnect = vi.spyOn(platform, 'handleClientDisconnected').mockResolvedValue()

    await internal.runHealthCheck()

    expect(disconnect).toHaveBeenCalledWith('client-a')
  })

  it('does not treat host sleep as client silence', async () => {
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000
    const { platform, socket, internal } = setupSession(tenMinutesAgo)
    internal.lastHealthCheck = tenMinutesAgo
    const disconnect = vi.spyOn(platform, 'handleClientDisconnected').mockResolvedValue()

    await internal.runHealthCheck()

    expect(disconnect).not.toHaveBeenCalled()
    expect(socket.ping).toHaveBeenCalledOnce()
  })

  it('delivers messages the client sent during the handshake', async () => {
    const platform = new WSPlatform('test-user-data')
    const parentMessages: Array<{ event: PlatformEvent; data: unknown }> = []
    platform.sendToParent = (payload): void => {
      parentMessages.push(payload as { event: PlatformEvent; data: unknown })
    }
    const socket = new FakeDeviceSocket()

    const connecting = (
      platform as unknown as {
        handleConnection(socket: WebSocket, req: IncomingMessage): Promise<void>
      }
    ).handleConnection(
      socket as unknown as WebSocket,
      {
        headers: { 'user-agent': 'test-device' }
      } as IncomingMessage
    )
    socket.receive({ type: 'get', request: 'settings', app: 'server' })
    await connecting

    expect(platform.getClients().map((client) => client.clientId)).toEqual(['device-1'])
    const received = parentMessages
      .filter((message) => message.event === PlatformEvent.DATA_RECEIVED)
      .map((message) => (message.data as { data: { type: string; request?: string } }).data)
    expect(received).toEqual([{ type: 'get', request: 'settings', app: 'server' }])
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
