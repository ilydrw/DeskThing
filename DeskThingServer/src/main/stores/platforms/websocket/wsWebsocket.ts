import WebSocket, { WebSocketServer } from 'ws'
import { Server as HttpServer, IncomingMessage } from 'http'
import { parentPort, workerData } from 'worker_threads'
import express from 'express'
import crypto from 'crypto'
import {
  PlatformEvent,
  PlatformConnectionOptions,
  PlatformStatus,
  PlatformPayloads
} from '@shared/interfaces/platformInterface'
import {
  SocketData,
  Client,
  DeviceToDeskthingData,
  ClientIdentifier,
  ProviderCapabilities,
  ConnectionState,
  ClientManifest,
  DESKTHING_DEVICE,
  DeskThingToDeviceCore,
  DEVICE_DESKTHING,
  PlatformIDs
} from '@deskthing/types'
import { ExpressServer } from './expressWorker'
import { WebsocketPlatformIPC } from '@shared/types'
import { handleError } from '@server/utils/errorHandler'

type AdditionalOptions = {
  port?: number
  address?: string
}

process.title = 'Websocket'

export class WSPlatform {
  private server: WebSocketServer | null = null
  private httpServer: HttpServer | null = null
  private clients: Map<string, { client: Client; socket: WebSocket }> = new Map()
  private isActive: boolean = false
  private startTime: number = 0
  private userDataPath: string
  private expressServer: ExpressServer | null = null
  private healthCheckInterval: NodeJS.Timeout | null = null
  private healthCheckFailures = new Map<string, number>()
  private readonly HEALTH_CHECK_INTERVAL = 30000
  private readonly HEALTH_CHECK_FAILURE_LIMIT = 2
  private options: PlatformConnectionOptions<AdditionalOptions> = {
    port: 8891,
    address: 'localhost'
  }

  private readonly identifier: Omit<ClientIdentifier, 'id' | 'method' | 'active'> = {
    providerId: PlatformIDs.WEBSOCKET,
    capabilities: [ProviderCapabilities.COMMUNICATE, ProviderCapabilities.PING],
    connectionState: ConnectionState.Connected
  }

  public readonly id = PlatformIDs.WEBSOCKET

  constructor(userDataPath: string) {
    this.userDataPath = userDataPath
  }

  private getInternalId(clientId: string): string | undefined {
    // Early quick lookup if the client hasn't been changed or taken
    if (this.clients.has(clientId)) {
      return clientId
    }

    for (const [platformConnectionId, { client }] of this.clients.entries()) {
      if (
        client.clientId === clientId ||
        client.identifiers[this.identifier.providerId]?.id === clientId
      ) {
        return platformConnectionId
      }
    }
    return undefined
  }

  sendToParent = (data: PlatformPayloads): void => {
    parentPort?.postMessage(data)
  }

  async start(options?: PlatformConnectionOptions<AdditionalOptions>): Promise<void> {
    if (this.isActive) return

    this.options = options ?? this.options
    const port = this.options.port || 8891
    const address = this.options.address

    const expressApp = express()
    this.expressServer = new ExpressServer(expressApp, this.userDataPath, port, address)
    this.expressServer.initializeServer()
    this.setupExpressListeners()
    this.httpServer = this.expressServer.getServer() as HttpServer

    this.server = new WebSocketServer({ server: this.httpServer })

    this.server.on('connection', this.handleConnection.bind(this))

    this.server.on('listening', () => {
      this.sendToParent({ event: PlatformEvent.SERVER_STARTED, data: { port, address } })
    })

    this.isActive = true
    this.startTime = Date.now()
    this.startHealthChecks()
    this.sendToParent({ event: PlatformEvent.STATUS_CHANGED, data: this.getStatus() })
  }

  async stop(): Promise<void> {
    if (!this.isActive) return

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }

    this.clients.forEach((client) => {
      client.socket.terminate()
    })
    this.clients.clear()
    this.healthCheckFailures.clear()

    if (this.server) {
      this.server.close()
      this.server = null
    }

    if (this.expressServer) {
      await this.expressServer.shutdown()
      this.expressServer = null
    }

    if (this.httpServer) {
      this.httpServer = null
    }

    this.isActive = false
    this.sendToParent({ event: PlatformEvent.STATUS_CHANGED, data: this.getStatus() })
  }

  private startHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }

    this.healthCheckInterval = setInterval(() => {
      this.runHealthCheck().catch((error) => {
        console.error('WebSocket health check failed:', error)
      })
    }, this.HEALTH_CHECK_INTERVAL)
  }

  private async runHealthCheck(): Promise<void> {
    const clientIds = Array.from(this.clients.keys())
    await Promise.all(
      clientIds.map(async (clientId) => {
        const result = await this.pingClient(clientId)
        if (this.isSuccessfulPing(result)) {
          this.healthCheckFailures.delete(clientId)
          return
        }

        const failures = (this.healthCheckFailures.get(clientId) ?? 0) + 1
        this.healthCheckFailures.set(clientId, failures)
        if (failures >= this.HEALTH_CHECK_FAILURE_LIMIT) {
          await this.handleClientDisconnected(clientId)
        }
      })
    )
  }

  private isSuccessfulPing(result: { server?: number; socket?: number }): boolean {
    return result.server !== undefined && result.socket !== undefined
  }

  private replaceClientConnection(clientId: string, client: Client, socket: WebSocket): void {
    const existingConnection = this.clients.get(clientId)
    this.clients.set(clientId, { client, socket })
    this.healthCheckFailures.delete(clientId)

    if (existingConnection && existingConnection.socket !== socket) {
      console.info(`Replacing stale WebSocket session for ${clientId}`)
      existingConnection.socket.terminate()
    }
  }

  setupExpressListeners = async (): Promise<void> => {
    this.expressServer?.on('client-connected', (manifest) => {
      console.debug(`Got a manifest request from ${manifest.connectionId}`, {
        domain: 'wsWebsocket',
        function: 'setupExpressListeners'
      })
    })
  }

  private async handleConnection(socket: WebSocket, req: IncomingMessage): Promise<void> {
    const platformConnectionId = 'pending-' + crypto.randomUUID()

    // Temporary client that will be updated once the connection is established
    const pendingClient: Client = {
      connected: false,
      timestamp: Date.now(),
      clientId: platformConnectionId,
      connectionState: ConnectionState.Connecting,
      primaryProviderId: this.identifier.providerId,
      identifiers: {
        [this.identifier.providerId]: {
          ...this.identifier,
          id: platformConnectionId,
          active: true
        }
      },
      meta: {
        [this.id]: {
          wsId: platformConnectionId
        }
      },
      userAgent: req.headers['user-agent'] || ''
    }

    this.clients.set(platformConnectionId, { client: pendingClient, socket })

    try {
      console.debug(
        `Got the connection for ${platformConnectionId}. Waiting 100ms before configuring`
      )
      // wait half a second to let the client itself initialize any socket listeners
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Check if socket is still open before proceeding
      if (socket.readyState !== WebSocket.OPEN) {
        console.error(`Socket for ${platformConnectionId} is not open. State: ${socket.readyState}`)
        this.clients.delete(platformConnectionId)
        return
      }

      socket.ping()

      const pingResult = await Promise.race([
        new Promise<boolean>((resolve) => {
          socket.once('pong', () => resolve(true))
        }),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000))
      ])

      if (!pingResult) {
        console.error(`Simple ping failed for ${platformConnectionId}`)
        socket.terminate()
        this.clients.delete(platformConnectionId)
        return
      } else {
        console.log(`Simple ping successful for ${platformConnectionId}`)
      }

      // Do a ping handshake to ensure it is connected

      const manifest = await this.getClientManifest(platformConnectionId, socket)
      const clientObj = this.clients.get(platformConnectionId)

      if (!clientObj) {
        console.error(
          `Failed to stabilize connection with ${platformConnectionId}. Did it get removed or disconnect?`
        )
        return
      }

      // A returning device keeps its durable ID and replaces any stale session.
      const finalClientId = manifest?.connectionId || platformConnectionId

      const finalClient: Client = {
        timestamp: Date.now(),
        ...clientObj.client,
        clientId: finalClientId,
        connected: true,
        connectionState: ConnectionState.Connected,
        primaryProviderId: this.identifier.providerId,
        manifest: manifest,
        identifiers: {
          [this.identifier.providerId]: {
            ...this.identifier,
            id: finalClientId,
            active: true
          }
        }
      }

      const result = await this.pingClient(platformConnectionId, socket, false)

      if (!this.isSuccessfulPing(result)) {
        console.error(`Failed establishing a connection with ${finalClientId}.`)
        socket?.close?.()
        socket?.terminate?.()
        this.clients.delete(platformConnectionId)
        return
      }

      finalClient.meta = {
        ...finalClient.meta,
        [PlatformIDs.WEBSOCKET]: {
          wsId: finalClientId,
          ping: result
        }
      }

      this.clients.delete(platformConnectionId)
      this.replaceClientConnection(finalClientId, finalClient, clientObj.socket)

      console.log(`Finished establishing connection with ${finalClientId}.`)

      // Only update the parent process once the client has been established as connected
      this.sendToParent({
        event: PlatformEvent.CLIENT_CONNECTED,
        data: finalClient
      })
      this.setupMessageHandling(finalClientId, socket)
    } catch (error) {
      console.error(`Failed to stabilize connection for client ${platformConnectionId}:`, error)
      if (socket.readyState === WebSocket.OPEN) {
        socket.close()
      }
      this.clients.delete(platformConnectionId)
    }
  }

  private setupMessageHandling(clientId: string, socket: WebSocket): void {
    socket.on('message', (message: WebSocket.Data) => {
      try {
        let messageStr: string
        if (typeof message === 'string') {
          messageStr = message
        } else if (message instanceof Buffer) {
          messageStr = message.toString('utf8')
        } else if (Array.isArray(message)) {
          messageStr = Buffer.concat(message).toString('utf8')
        } else {
          console.error(`Received unsupported message type from ${clientId}: ${message}`)
          return
        }

        const data = JSON.parse(messageStr) as DeviceToDeskthingData & { clientId: string }
        const platformInternalId = this.getInternalId(clientId || data.clientId)

        if (!platformInternalId) {
          console.error(`Unable to find record of ${clientId}. Cancelling message`)
          console.log('Available clientIds:', Array.from(this.clients.keys()))
          return
        }

        const clientObj = this.clients.get(platformInternalId)

        if (clientObj) {
          const client = clientObj.client
          this.ensureConnected(client)

          if (data.type == DEVICE_DESKTHING.PING) {
            console.log(`Got a ping from the client`)
            this.sendData(client.clientId, {
              type: DESKTHING_DEVICE.PONG,
              payload: client.clientId,
              app: 'client'
            })
          }

          this.sendToParent({
            event: PlatformEvent.DATA_RECEIVED,
            data: { client, data }
          })
        } else {
          console.error(
            `Socket not open or client not registered ${clientId} ${JSON.stringify({ ...data, payload: 'Scrubbed payload' })}`
          )
        }
      } catch (error) {
        console.error(`Error parsing message from ${clientId}: ${error}`)
        this.sendToParent({
          event: PlatformEvent.ERROR,
          data: new Error(`Invalid message format: ${error}`)
        })
      }
    })

    socket.on('close', () => {
      const currentId = clientId
      const currentConnection = this.clients.get(currentId)
      if (!currentConnection || currentConnection.socket !== socket) return
      const currentClient = currentConnection.client

      this.clients.delete(currentId)
      this.healthCheckFailures.delete(currentId)
      this.sendToParent({
        event: PlatformEvent.CLIENT_DISCONNECTED,
        data: currentClient
      })
    })

    socket.on('ping', () => {
      console.debug(`Ping received from client ${clientId}`)
      socket.pong()
    })

    socket.on('error', (error) => {
      const currentId = clientId
      const currentConnection = this.clients.get(currentId)
      if (!currentConnection || currentConnection.socket !== socket) return
      const currentClient = currentConnection.client

      console.error(`WebSocket error for client ${currentId}:`, error)
      this.sendToParent({ event: PlatformEvent.ERROR, data: error })

      // Clean up if the client is still in pending state
      this.clients.delete(currentId)
      this.healthCheckFailures.delete(currentId)
      this.sendToParent({
        event: PlatformEvent.CLIENT_DISCONNECTED,
        data: {
          ...currentClient,
          connectionState: ConnectionState.Failed
        }
      })
    })
  }

  private ensureConnected: (
    client: Client
  ) => asserts client is Extract<Client, { connected: true }> = (client: Client) => {
    if (!client.connected) {
      throw new Error('Client is not connected')
    }
  }

  async sendData(clientId: string, data: DeskThingToDeviceCore): Promise<boolean> {
    const platformConnectionId = this.getInternalId(clientId)
    if (!platformConnectionId) {
      console.warn(`Client ${clientId} does not have an internal id`)
      return false
    }

    const clientConnection = this.clients.get(platformConnectionId)
    if (!clientConnection) {
      console.warn('(wsWebsocket) Connection does not exist!')
      return false
    }

    if (clientConnection.socket.readyState !== WebSocket.OPEN) {
      await this.handleClientDisconnected(clientId, clientConnection.client)
      return false
    }

    try {
      console.log(
        `Sending data type ${data.type} with request ${data.request} to client ${clientId}`
      )
      await new Promise<void>((resolve, reject) => {
        clientConnection.socket.send(JSON.stringify(data), (error) => {
          if (error) reject(error)
          else resolve()
        })
      })
      return true
    } catch (error) {
      this.sendToParent({
        event: PlatformEvent.ERROR,
        data:
          error instanceof Error
            ? error
            : new Error('Unknown error occurred sending data to websocket', { cause: error })
      })
      return false
    }
  }

  async broadcastData(data: SocketData): Promise<void> {
    this.clients.forEach(({ socket }) => {
      try {
        if (socket.readyState == WebSocket.OPEN) {
          socket.send(JSON.stringify(data))
        } else {
          console.error('Socket not open, adding to queue')
        }
      } catch (error) {
        console.error('Encountered error ', error)
        this.sendToParent({
          event: PlatformEvent.ERROR,
          data:
            error instanceof Error
              ? error
              : new Error(
                  'Unknown error occurred broadcasting data to websocket clients' +
                    handleError(error),
                  {
                    cause: error
                  }
                )
        })
      }
    })
  }

  getClients(): Client[] {
    return Array.from(this.clients.values()).map(({ client }) => client)
  }

  async fetchClients(): Promise<Client[]> {
    const clients = this.getClients()
    this.sendToParent({
      event: PlatformEvent.CLIENT_LIST,
      data: clients
    })
    return clients
  }

  getClientById(clientId: string): Client | undefined {
    const platformConnectionId = this.getInternalId(clientId)
    if (!platformConnectionId) return undefined
    return this.clients.get(platformConnectionId)?.client
  }

  isRunning(): boolean {
    return this.isActive
  }

  updateClient(clientId: string, newClient: Partial<Client>, notify = true): void {
    try {
      const platformConnectionId = this.getInternalId(clientId)
      if (!platformConnectionId) {
        console.error(`[updateClient] Unable to find the client for id ${clientId}`)
        return
      }

      const clientObj = this.clients.get(platformConnectionId)
      if (!clientObj) {
        console.error(`[updateClient] Unable to find the internal client for id ${clientId}`)
        return
      }

      const { client } = clientObj
      const updatedClient = { ...client, ...newClient } as Client
      // Determine primary provider based on capabilities
      if (Object.values(updatedClient.identifiers).length > 0) {
        const providers = Object.values(updatedClient.identifiers).filter((id) => id.active)
        const primaryProvider = providers.sort(
          (a, b) => (b.capabilities?.length || 0) - (a.capabilities?.length || 0)
        )[0]

        if (primaryProvider) {
          updatedClient.connected = true
          updatedClient.primaryProviderId = primaryProvider.providerId
          updatedClient.timestamp = Date.now()
        } else {
          updatedClient.connected = false
          delete updatedClient.primaryProviderId
        }
      } else {
        updatedClient.connected = false
        delete updatedClient.primaryProviderId
      }

      clientObj.client = updatedClient
      if (notify) this.sendToParent({ event: PlatformEvent.CLIENT_UPDATED, data: updatedClient })
      this.clients.set(platformConnectionId, clientObj)
      console.debug('[updateClient] Updated the client')
    } catch (error) {
      console.error('[updateClient] Error updating client:', error)
      this.sendToParent({
        event: PlatformEvent.ERROR,
        data: new Error(handleError(error))
      })
    }
  }

  async refreshClients(): Promise<void> {
    const clientIds = Array.from(this.clients.keys())

    const results = await Promise.all(clientIds.map((id) => this.refreshClient(id, true)))

    const successCount = results.filter((r) => r).length
    console.log(
      `Refreshed clients: ${successCount} active, ${results.length - successCount} disconnected`
    )

    this.sendToParent({
      event: PlatformEvent.REFRESHED_CLIENTS,
      data: {
        active: successCount,
        disconnected: results.length - successCount
      }
    })
  }

  async refreshClient(clientId: string, force: boolean = false): Promise<Client | undefined> {
    if (force) await this.pingClient(clientId)
    const platformConnectionId = this.getInternalId(clientId)
    if (!platformConnectionId) return undefined
    return this.clients.get(platformConnectionId)?.client
  }

  getStatus(): PlatformStatus {
    const status = {
      isActive: this.isActive,
      clients: this.getClients(),
      uptime: this.isActive ? Date.now() - this.startTime : 0
    }
    this.sendToParent({
      event: PlatformEvent.STATUS_CHANGED,
      data: status
    })
    return status
  }

  async handleClientDisconnected(clientId: string, client?: Client): Promise<void> {
    try {
      const platformConnectionId = this.getInternalId(clientId)
      if (!platformConnectionId) {
        console.error(
          `[handleClientDisconnected] Unable to find the internal client for id ${clientId}. Disconnecting`
        )
        this.sendToParent({
          event: PlatformEvent.CLIENT_DISCONNECTED,
          data: client || {
            clientId,
            connected: false,
            identifiers: {},
            meta: {},
            connectionState: ConnectionState.Disconnected
          }
        })
        return
      }
      const clientConnection = this.clients.get(platformConnectionId)

      if (clientConnection) {
        this.clients.delete(platformConnectionId)
        this.healthCheckFailures.delete(platformConnectionId)

        if (clientConnection.socket.readyState === WebSocket.OPEN) {
          clientConnection.socket.terminate()
        }

        this.sendToParent({
          event: PlatformEvent.CLIENT_DISCONNECTED,
          data: client || clientConnection.client
        })
      }
    } catch (error) {
      console.error(`Error handling disconnection for client ${clientId}:`, error)
    }
  }

  private async getClientManifest(
    clientId: string,
    socket?: WebSocket
  ): Promise<ClientManifest | undefined> {
    // Get the client's socket
    const platformConnectionId = this.getInternalId(clientId)
    if (!platformConnectionId) return

    const clientObj = this.clients.get(platformConnectionId)
    if (!clientObj) {
      console.error(`Unable to find the client for id ${clientId}`)
      return
    }

    // Use provided socket or get from client object
    socket = socket || clientObj.socket

    // Check if socket is open before attempting ping
    if (socket.readyState !== WebSocket.OPEN) {
      console.debug(`Socket is not open for client ${clientId}. The state is ${socket.readyState}`)
      return
    }

    const manifest = await new Promise<ClientManifest | undefined>((resolve) => {
      const timeoutId = setTimeout(() => {
        socket.removeListener('message', messageHandler)
        resolve(undefined)
      }, 5000)

      const messageHandler = (data: WebSocket.Data): void => {
        try {
          const message = JSON.parse(data.toString()) as DeviceToDeskthingData
          if (message.type === DEVICE_DESKTHING.MANIFEST && message.payload) {
            socket.removeListener('message', messageHandler)
            clearTimeout(timeoutId)
            resolve(message.payload)
          }
        } catch {
          // Ignore non-JSON messages
        }
      }

      socket.on('message', messageHandler)

      // Directly send the socket data so that the temporary id isn't included
      const data: DeskThingToDeviceCore = {
        type: DESKTHING_DEVICE.GET,
        request: 'manifest',
        app: 'client'
      }
      socket.send(JSON.stringify(data))
    })

    return manifest
  }

  async pingClient(
    clientId: string,
    socket?: WebSocket,
    notify = true
  ): Promise<{ server?: number; socket?: number }> {
    // Get the client's socket
    const platformConnectionId = this.getInternalId(clientId)
    if (!platformConnectionId) return {}

    console.debug(`Pinging client ${clientId}`)

    const clientObj = this.clients.get(platformConnectionId)
    if (!clientObj) {
      console.error(`[pingClient] Unable to find the client for id ${clientId}`)
      await this.handleClientDisconnected(clientId)
      return {}
    }

    // Use provided socket or get from client object
    socket = socket || clientObj.socket

    // Check if socket is open before attempting ping
    if (socket.readyState !== WebSocket.OPEN) {
      console.debug(`Socket is not open for client ${clientId}. The state is ${socket.readyState}`)
      await this.handleClientDisconnected(clientId, clientObj.client)
      return {}
    }

    // start ping timers
    let socketPingTime = Date.now()
    let serverPingTime = Date.now()

    // Perform ping with timeout
    try {
      await Promise.race([
        new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            socket.removeListener('pong', pongHandler)
            socket.removeListener('message', messageHandler)
            reject(
              new Error(`Ping timeout. wsResolved: ${wsResolved}, appResolved: ${appResolved}`)
            )
          }, 5000)

          let wsResolved = false
          let appResolved = false

          const cleanup = (): void => {
            if (wsResolved && appResolved) {
              socket.removeListener('pong', pongHandler)
              socket.removeListener('message', messageHandler)
              clearTimeout(timeout)
              resolve(true)
            }
          }

          const pongHandler = (): void => {
            wsResolved = true
            socketPingTime = Date.now() - socketPingTime
            cleanup()
          }

          const messageHandler = (data: WebSocket.Data): void => {
            try {
              const message = JSON.parse(data.toString())
              if (message.type === 'pong') {
                appResolved = true
                serverPingTime = Date.now() - serverPingTime
                cleanup()
              }
            } catch {
              // Ignore non-JSON messages
            }
          }

          socket.on('pong', pongHandler)
          socket.on('message', messageHandler)

          // Send ping message at application layer
          socket.send(
            JSON.stringify({ type: DESKTHING_DEVICE.PING, payload: clientId, app: 'client' })
          )
          socket.ping()
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Ping timeout')), 5000))
      ])

      const pingResult = { server: serverPingTime, socket: socketPingTime }

      if (clientObj.client.meta?.[PlatformIDs.WEBSOCKET]) {
        clientObj.client.meta[PlatformIDs.WEBSOCKET].ping = pingResult
        this.updateClient(clientId, clientObj.client, notify)
      } else {
        clientObj.client.meta = {
          ...clientObj.client.meta,
          [PlatformIDs.WEBSOCKET]: { wsId: clientId, ping: pingResult }
        }
        this.updateClient(clientId, clientObj.client, notify)
      }

      return pingResult
    } catch (error) {
      console.error(`Ping failed for client ${clientId}`, error)
      return {}
    }
  }

  async handleCustomEvent(data: WebsocketPlatformIPC): Promise<void> {
    switch (data.type) {
      case 'disconnect':
        await this.handleClientDisconnected(data.clientId)
        break
      case 'restart':
        console.log('Restarting websocket server')
        await this.stop()
        await this.start(this.options)
        break
      case 'ping':
        {
          const result = await this.pingClient(data.clientId)
          this.sendToParent({
            event: PlatformEvent.CLIENT_PONG,
            data: { clientId: data.clientId, result }
          })
        }
        break
      default:
        console.error(`Unsupported event: ${data.type}`)
    }
  }
}
// Worker thread communication
if (parentPort) {
  const platform = new WSPlatform(workerData.userDataPath)

  parentPort.on('message', async (message) => {
    switch (message.type) {
      case 'start':
        await platform.start(message.options)
        break
      case 'stop':
        await platform.stop()
        break
      case 'sendData':
        platform.sendToParent({
          event: PlatformEvent.DATA_SENT,
          data: {
            requestId: message.requestId,
            success: await platform.sendData(message.clientId, message.data)
          }
        })
        break
      case 'broadcast':
        await platform.broadcastData(message.data)
        break
      case 'fetchClients':
        await platform.fetchClients()
        break
      case 'refreshClients':
        await platform.refreshClients()
        break
      case 'refreshClient':
        {
          const client = await platform.refreshClient(message.clientId, message.forceRefresh)
          if (!client) return
          platform.sendToParent({
            event: PlatformEvent.CLIENT_UPDATED,
            data: client
          })
        }
        break
      case 'updateClient':
        platform.updateClient(message.clientId, message.client, message.notify)
        break
      case 'getStatus':
        platform.getStatus()
        break
      case 'websocketEvent':
        await platform.handleCustomEvent(message.data)
        break
    }
  })
}
