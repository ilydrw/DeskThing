import { AuthStoreClass, authStoreEventTypes } from '@shared/stores/authStore'
import { EventEmitter } from 'node:events'
import { Server, createServer, IncomingMessage, ServerResponse } from 'http'
import { getAppData } from '../services/files/appFileService'
import Logger from '../utils/logger'
import { SettingsStoreClass } from '@shared/stores/settingsStore'
import { isSafePathSegment } from '@server/utils/pathSecurity'

const successView = '<h1>Success</h1><p>You can now close this window.</p>'
const CALLBACK_HOST = '127.0.0.1'
const DEFAULT_CALLBACK_PORT = 8888

const isValidPort = (port: number): boolean => Number.isInteger(port) && port >= 1 && port <= 65_535

const sendHtml = (res: ServerResponse, status: number, body: string): void => {
  res.writeHead(status, {
    'Content-Security-Policy': "default-src 'none'",
    'Content-Type': 'text/html; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  })
  res.end(body)
}

export class AuthStore extends EventEmitter<authStoreEventTypes> implements AuthStoreClass {
  private server: Server | null = null
  private callbackPort: number = 8888
  private settingStore: SettingsStoreClass
  private settingsCleanup?: () => void
  private portChange: Promise<void> = Promise.resolve()
  private initialization?: Promise<void>

  private _initialized: boolean = false
  public get initialized(): boolean {
    return this._initialized
  }

  constructor(settingStore: SettingsStoreClass) {
    super()
    this.settingStore = settingStore
  }

  async initialize(): Promise<void> {
    if (this._initialized) return
    this.initialization ??= (async () => {
      await this.settingStore.initialize()
      await this.initializeServer()
      this.initializeListeners()
      this._initialized = true
    })().finally(() => { this.initialization = undefined })
    await this.initialization
  }

  async dispose(): Promise<void> {
    this.settingsCleanup?.()
    this.settingsCleanup = undefined
    await this.portChange.catch(() => undefined)
    const server = this.server
    this.server = null
    if (server) {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  }

  private async initializeServer(): Promise<void> {
    try {
      const callbackPort = await this.settingStore.getSetting('server_callbackPort')
      if (callbackPort !== undefined && !isValidPort(callbackPort)) {
        Logger.warn(`Ignoring invalid callback port: ${callbackPort}`, {
          source: 'authStore',
          function: 'initializeServer'
        })
      }
      await this.setCallbackPort(
        callbackPort !== undefined && isValidPort(callbackPort)
          ? callbackPort
          : DEFAULT_CALLBACK_PORT
      )
    } catch (error) {
      Logger.error('Failed to start the server', {
        error: error as Error,
        source: 'authStore',
        function: 'initializeServer'
      })
    }
  }

  private initializeListeners(): void {
    this.settingsCleanup = this.settingStore.on('server_callbackPort', (callbackPort) => {
      if (callbackPort != this.callbackPort) {
        void this.setCallbackPort(callbackPort).catch((error) => {
          Logger.error('Failed to update the callback server port', {
            error: error as Error,
            source: 'authStore',
            function: 'initializeListeners'
          })
        })
      }
    })
  }

  private async startServer(port: number): Promise<void> {
    const nextServer = createServer((req, res) => {
      void this.handleRequest(req, res).catch((error) => {
        Logger.error('Callback request failed', {
          error: error as Error,
          source: 'authStore',
          function: 'handleRequest'
        })
        if (!res.headersSent) {
          sendHtml(res, 500, '<h1>Request Failed</h1>')
        } else {
          res.destroy()
        }
      })
    })

    await new Promise<void>((resolve, reject) => {
      const handleListenError = (error: Error): void => {
        nextServer.off('error', handleListenError)
        reject(error)
      }

      nextServer.once('error', handleListenError)
      nextServer.listen(port, CALLBACK_HOST, () => {
        nextServer.off('error', handleListenError)
        resolve()
      })
    })

    nextServer.on('error', (error) => {
      Logger.error('Callback server error', {
        error,
        source: 'authStore',
        function: 'startServer'
      })
    })

    const previousServer = this.server
    this.server = nextServer
    if (previousServer) {
      previousServer.closeAllConnections()
      await new Promise<void>((resolve) => {
        previousServer.close(() => resolve())
      })
    }

    Logger.debug(`Callback server running at http://${CALLBACK_HOST}:${port}/`, {
      source: 'authStore',
      function: 'startServer'
    })
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405, { Allow: 'GET' })
      res.end()
      return
    }

    const callbackUrl = new URL(req.url || '/', `http://${CALLBACK_HOST}`)
    if (callbackUrl.pathname.startsWith('/callback/')) {
      await this.handleCallback(callbackUrl, res)
      return
    }

    sendHtml(res, 404, '<h1>Not Found</h1><p>The requested URL was not found.</p>')
  }

  private async handleCallback(callbackUrl: URL, res: ServerResponse): Promise<void> {
    Logger.debug(`AUTH: Received callback request for ${callbackUrl.pathname}`)

    const urlParts = callbackUrl.pathname.split('/').filter(Boolean)
    if (urlParts.length !== 2 || !isSafePathSegment(urlParts[1])) {
      res.writeHead(400, { 'Content-Type': 'text/plain' })
      res.end('Invalid callback URL')
      return
    }

    const appName = urlParts[1]
    const code = callbackUrl.searchParams.get('code')
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/plain' })
      res.end('Missing authorization code')
      return
    }

    const appData = await getAppData()

    if (!appData || !appData[appName] || !appData[appName].enabled) {
      sendHtml(res, 404, '<h1>App Not Found</h1><p>The requested app is not active.</p>')
      return
    }

    this.emit('appData', { app: appName, callbackData: code })

    sendHtml(res, 200, successView)
  }

  public handleProtocol = async (protocol: string): Promise<void> => {
    try {
      const parsedUrl = new URL(protocol)
      // First try to get app from query parameter
      let appName = parsedUrl.searchParams.get('app')

      // If not found, fall back to the pathname (original behavior)
      if (!appName) {
        appName = parsedUrl.hostname || parsedUrl.pathname.split('/').filter(Boolean)[0] || null
      }

      Logger.debug(`Received protocol request for ${appName}`, {
        source: 'authStore',
        function: 'handleProtocol'
      })

      const code = parsedUrl.searchParams.get('code')
      const appData = appName && isSafePathSegment(appName) ? await getAppData() : undefined
      if (appName && code && appData?.[appName]?.enabled) {
        Logger.debug(`Emitting appData to app ${appName}`, {
          source: 'authStore',
          function: 'handleProtocol'
        })
        this.emit('appData', { app: appName, callbackData: code })
      } else {
        Logger.error('Invalid protocol callback request', {
          source: 'authStore',
          function: 'handleProtocol'
        })
      }
    } catch (error) {
      Logger.error('Error parsing protocol callback URL', {
        error: error as Error,
        source: 'authStore',
        function: 'handleProtocol'
      })
    }
  }

  private async setCallbackPort(port: number): Promise<void> {
    if (!isValidPort(port)) {
      Logger.warn(`Ignoring invalid callback port: ${port}`, {
        source: 'authStore',
        function: 'setCallbackPort'
      })
      return
    }
    const change = this.portChange.catch(() => undefined).then(async () => {
      if (port === this.callbackPort && this.server?.listening) return
      await this.startServer(port)
      this.callbackPort = port
    })
    this.portChange = change
    await change
  }
}
