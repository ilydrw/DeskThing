import express, { NextFunction, Request, Response } from 'express'
import cors from 'cors'
import { Server } from 'node:http'
import { join } from 'node:path'
import fs from 'node:fs'
import { readFile } from 'node:fs/promises'
import {
  ClientConnectionMethod,
  ClientDeviceType,
  ClientManifest,
  ClientPlatformIDs
} from '@deskthing/types'
import EventEmitter from 'node:events'
import { getServiceConfig } from '@server/config/serviceConfig'
import {
  fetchProxyResource,
  MAX_PROXY_RESPONSE_BYTES,
  ProxyRequestError
} from '@server/services/proxy/proxySecurity'
import { isSafePathSegment, resolvePathWithinRoot } from '@server/utils/pathSecurity'
import { randomUUID } from 'node:crypto'

export const DEVICE_ID_COOKIE = 'deskthing-device-id'
const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DEVICE_ID_MAX_AGE_MS = 10 * 365 * 24 * 60 * 60 * 1000

export const getDeviceIdFromCookie = (cookieHeader?: string): string | undefined => {
  if (!cookieHeader) return

  for (const cookie of cookieHeader.split(';')) {
    const [name, ...valueParts] = cookie.trim().split('=')
    if (name !== DEVICE_ID_COOKIE) continue
    const value = decodeURIComponent(valueParts.join('='))
    return DEVICE_ID_PATTERN.test(value) ? value : undefined
  }

  return
}

type ExpressServerEvents = {
  'client-connected': [ClientManifest]
}

export class ExpressServer extends EventEmitter<ExpressServerEvents> {
  private app: express.Application
  private server: Server | null = null
  private userDataPath: string
  private port: number
  private address: string

  constructor(
    expressApp: express.Application,
    userDataPath: string,
    port: number,
    address = '0.0.0.0'
  ) {
    super()
    this.app = expressApp
    this.port = port
    this.address = address
    this.userDataPath = userDataPath
  }

  public initializeServer(): void {
    this.app.use(cors())
    this.app.use(express.json())

    this.app.use((req, _res, next) => {
      console.log(`[ExpressWorker.${req.method}]: ${req.url}`)
      next()
    })
    this.setupAppRoutes()
    this.setupResourceRoutes()
    this.setupProxyRoutes()

    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      console.error('Express error:', err)
      res.status(500).send('Server error')
    })

    this.server = this.app.listen(this.port, this.address)

    this.setupClientRoutes()

    // Default all routes to / as a fallback
    this.app.get('/', (_req, res) => {
      res.redirect('/client/')
    })
  }

  public getServer(): Server | null {
    return this.server
  }

  public getApp(): express.Application {
    return this.app
  }

  private setupClientRoutes(): void {
    const webAppDir = join(this.userDataPath, 'webapp')

    this.app.get('/manifest.json', (_req, res) => {
      res.redirect('/client/manifest.json')
    })

    this.app.get('/client/manifest.json', async (req: Request, res: Response) => {
      const manifestPath = join(webAppDir, 'manifest.json')
      const clientIp = req.hostname

      console.log('Got a request to /client/manifest.json')

      try {
        if (!fs.existsSync(manifestPath)) {
          console.error(`Manifest file not found at: ${manifestPath}`)
          res.status(404).send('manifest.json not found. Do you have a client installed?')
          return
        }

        const manifestContent = await readFile(manifestPath, 'utf8')
        const manifest = JSON.parse(manifestContent) as ClientManifest

        manifest.context = getDeviceType(req.headers['user-agent'], clientIp, this.port)

        const existingDeviceId = getDeviceIdFromCookie(req.headers.cookie)
        const deviceId = existingDeviceId ?? randomUUID()
        if (!existingDeviceId) {
          res.cookie(DEVICE_ID_COOKIE, deviceId, {
            httpOnly: true,
            sameSite: 'lax',
            maxAge: DEVICE_ID_MAX_AGE_MS
          })
        }
        manifest.connectionId = deviceId

        this.emit('client-connected', manifest)

        console.log('Sending manifest:', manifest)
        res.type('application/json').json(manifest)
        return
      } catch (error) {
        console.error('Error reading manifest:', error)
        res.status(404).send('manifest.json not found. Do you have a client installed?')
      }
    })

    if (fs.existsSync(webAppDir)) {
      this.app.use(
        '/client',
        express.static(webAppDir, {
          index: 'index.html',
          extensions: ['html', 'htm']
        })
      )
    }

    this.app.get('/client/*', (_req, res) => {
      const indexPath = join(webAppDir, 'index.html')
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath)
      } else {
        res.status(404).send('App not found')
      }
    })

    // this.app.get('/client/', (req, res) => {
    //   const indexPath = join(this.userDataPath, 'webapp', 'index.html')
    //   if (fs.existsSync(indexPath)) {
    //     res.sendFile(indexPath)
    //   } else {
    //     res.status(404).send('Index file not found')
    //   }
    // })
  }

  private setupAppRoutes(): void {
    const baseAppPath = join(this.userDataPath, 'apps')

    this.app.use('/app/:appName', (req: Request, res: Response, next: NextFunction) => {
      const appName = req.params.appName
      if (!isSafePathSegment(appName)) {
        res.status(400).send('Invalid app identifier')
        return
      }

      const appPath = resolvePathWithinRoot(baseAppPath, appName, 'client')
      const legacyAppPath = resolvePathWithinRoot(baseAppPath, appName)
      if (!appPath || !legacyAppPath) {
        res.status(400).send('Invalid app path')
        return
      }

      if (fs.existsSync(appPath)) {
        express.static(appPath, {
          index: 'index.html',
          extensions: ['html', 'htm']
        })(req, res, next)
      } else if (fs.existsSync(legacyAppPath)) {
        express.static(legacyAppPath, {
          index: 'index.html',
          extensions: ['html', 'htm']
        })(req, res, next)
      } else {
        res.status(404).json({
          error: 'App content not found',
          message: 'The app exists but its content could not be located'
        })
      }
    })

    this.app.get('/app/:appName/*', async (req: Request, res: Response, next: NextFunction) => {
      const appName = req.params.appName
      if (!isSafePathSegment(appName)) {
        res.status(400).send('Invalid app identifier')
        return
      }

      const appPath = resolvePathWithinRoot(baseAppPath, appName, 'client')
      const legacyAppPath = resolvePathWithinRoot(baseAppPath, appName)
      if (!appPath || !legacyAppPath) {
        res.status(400).send('Invalid app path')
        return
      }

      if (fs.existsSync(appPath)) {
        console.log('Returning app path')
        return express.static(appPath)(req, res, next)
      } else if (fs.existsSync(legacyAppPath)) {
        console.log('Returning legacy app path')
        return express.static(legacyAppPath)(req, res, next)
      } else {
        return res.status(404).json({
          error: 'App content not found',
          message: 'The app exists but its content could not be located'
        })
      }
    })
  }

  private setupResourceRoutes(): void {
    const baseAppPath = join(this.userDataPath, 'apps')

    // Serve icons dynamically based on the URL
    this.app.use(
      '/icons',
      express.static(baseAppPath, {
        maxAge: '1d',
        immutable: true,
        etag: true,
        lastModified: true
      })
    )

    this.app.use(
      '/resource/icons',
      express.static(baseAppPath, {
        maxAge: '1d',
        immutable: true,
        etag: true,
        lastModified: true
      })
    )

    this.app.get('/resource/image/:appName/:imageName', async (req: Request, res: Response) => {
      const { appName, imageName } = req.params

      if (!isSafePathSegment(appName) || !isSafePathSegment(imageName)) {
        res.status(400).send('Invalid image path')
        return
      }

      const imagePath = resolvePathWithinRoot(baseAppPath, appName, 'images', imageName)
      if (!imagePath) {
        res.status(400).send('Invalid image path')
        return
      }

      if (fs.existsSync(imagePath)) {
        res.sendFile(imagePath)
      } else {
        res.status(404).send('Image not found')
      }
    })

    this.app.get('/resource/thumbnail/:id', (req: Request, res: Response) => {
      const thumbnailId = req.params.id
      if (!/^[a-f0-9]{64}$/i.test(thumbnailId)) {
        res.status(400).send('Invalid thumbnail identifier')
        return
      }

      const thumbnailsDir = join(this.userDataPath, 'thumbnails')
      const thumbnailPath = join(thumbnailsDir, thumbnailId)

      // Add .jpg extension if not present
      const fullPath = thumbnailPath.endsWith('.jpg') ? thumbnailPath : `${thumbnailPath}.jpg`

      if (fs.existsSync(fullPath)) {
        res.sendFile(fullPath, {
          maxAge: '1d',
          immutable: true,
          etag: true,
          lastModified: true
        })
      } else {
        res.status(404).send('Thumbnail not found')
      }
    })

    this.app.get('/resource/task/:appName/:id', (req: Request, res: Response) => {
      const stepId = req.params.id
      const appName = req.params.appName
      if (!isSafePathSegment(appName) || !isSafePathSegment(stepId)) {
        res.status(400).send('Invalid task image path')
        return
      }

      const appPath = resolvePathWithinRoot(baseAppPath, appName)
      if (!appPath) {
        res.status(400).send('Invalid task image path')
        return
      }

      const tasksDir = join(appPath, 'images', 'tasks')
      const stepImgPath = join(tasksDir, stepId)

      // Add .jpg extension if not present
      const fullPath = stepImgPath.endsWith('.jpg') ? stepImgPath : `${stepImgPath}.jpg`

      if (fs.existsSync(fullPath)) {
        console.log('Returning step image:', fullPath)
        res.sendFile(fullPath, {
          maxAge: '1d',
          immutable: true,
          etag: true,
          lastModified: true
        })
      } else {
        console.error('Step image not found:', fullPath)
        res.status(404).send('Step image not found')
      }
    })

    this.app.get('/gen/:appName/*', (req, res) => {
      const appName = req.params.appName
      const filePath = req.params[0]
      if (!isSafePathSegment(appName) || typeof filePath !== 'string') {
        res.status(400).send('Invalid generated resource path')
        return
      }

      const appPath = join(baseAppPath, appName, 'server')
      const fullPath = resolvePathWithinRoot(appPath, filePath)
      if (!fullPath) {
        res.status(400).send('Invalid generated resource path')
        return
      }

      if (fs.existsSync(appPath)) {
        console.log('Returning file path', fullPath, req.url)
        res.sendFile(fullPath, {
          maxAge: '1d',
          immutable: true,
          etag: true,
          lastModified: true
        })
      } else {
        res.status(404).json({
          error: 'Server content not found',
          message: 'Ensure client is on version v0.10.0 or later'
        })
        return
      }
    })
  }

  private proxyResource = async (url: string, res: Response): Promise<void> => {
    try {
      const { proxyAllowPrivateNetwork } = getServiceConfig()
      const response = await fetchProxyResource(url, {
        allowPrivateNetwork: proxyAllowPrivateNetwork
      })

      if (!response.ok) {
        res.status(response.status).send(`Upstream resource responded with ${response.status}`)
        return
      }

      const declaredLength = Number(response.headers.get('content-length'))
      if (Number.isFinite(declaredLength) && declaredLength > MAX_PROXY_RESPONSE_BYTES) {
        await response.body?.cancel()
        res.status(413).send('Upstream resource exceeds the proxy size limit')
        return
      }

      const forwardedHeaders = [
        'cache-control',
        'content-encoding',
        'content-length',
        'content-type',
        'etag',
        'last-modified'
      ]
      for (const header of forwardedHeaders) {
        const value = response.headers.get(header)
        if (value) res.setHeader(header, value)
      }

      if (!response.body) {
        res.sendStatus(204)
        return
      }

      const reader = response.body.getReader()
      let transferredBytes = 0
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        transferredBytes += value.byteLength
        if (transferredBytes > MAX_PROXY_RESPONSE_BYTES) {
          await reader.cancel()
          res.destroy(new Error('Upstream resource exceeded the proxy size limit'))
          return
        }

        res.write(value)
      }

      res.end()
    } catch (error) {
      const statusCode =
        error instanceof ProxyRequestError
          ? error.statusCode
          : error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
            ? 504
            : 502
      const message =
        error instanceof ProxyRequestError ? error.message : 'Unable to fetch proxied resource'

      if (error instanceof ProxyRequestError) {
        console.warn(`Proxy request rejected: ${error.message}`)
      } else {
        console.error('Error proxying resource:', error)
      }
      if (res.headersSent) {
        res.destroy()
      } else {
        res.status(statusCode).send(message)
      }
    }
  }

  private setupProxyRoutes(): void {
    this.app.get('/proxy/fetch/:url(*)', async (req: Request, res: Response) => {
      await this.proxyResource(req.params.url, res)
    })

    this.app.get('/proxy/v1', async (req: Request, res: Response) => {
      const url = req.query.url
      if (typeof url !== 'string' || !url) {
        res.status(400).send('Missing url query parameter')
        return
      }

      await this.proxyResource(url, res)
    })
  }

  public shutdown(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve())
      } else {
        resolve()
      }
    })
  }
}

const getDeviceType = (userAgent: string | undefined, ip, port): ClientDeviceType => {
  if (!userAgent) {
    return {
      method: ClientConnectionMethod.LAN,
      ip,
      port,
      id: ClientPlatformIDs.Unknown,
      name: 'unknown'
    }
  }

  userAgent = userAgent.toLowerCase()

  const deviceMap = {
    // Desktops
    linux: { id: ClientPlatformIDs.Desktop, name: 'linux' },
    win: { id: ClientPlatformIDs.Desktop, name: 'windows' },
    mac: { id: ClientPlatformIDs.Desktop, name: 'mac' },
    chromebook: { id: ClientPlatformIDs.Desktop, name: 'chromebook' },

    // Tablets
    ipad: { id: ClientPlatformIDs.Tablet, name: 'tablet' },
    webos: { id: ClientPlatformIDs.Tablet, name: 'webos' },
    kindle: { id: ClientPlatformIDs.Tablet, name: 'kindle' },

    // Mobile
    iphone: { id: ClientPlatformIDs.Iphone, name: 'iphone' },
    'firefox os': { id: ClientPlatformIDs.Iphone, name: 'firefox-os' },
    blackberry: { id: ClientPlatformIDs.Iphone, name: 'blackberry' },
    'windows phone': { id: ClientPlatformIDs.Iphone, name: 'windows-phone' }
  }

  // Special case for Android
  if (userAgent.includes('android')) {
    return {
      method: ClientConnectionMethod.LAN,
      ip,
      port,
      id: userAgent.includes('mobile') ? ClientPlatformIDs.Iphone : ClientPlatformIDs.Tablet,
      name: userAgent.includes('mobile') ? 'android' : 'tablet'
    }
  }

  // Find matching device from map
  const matchedDevice = Object.entries(deviceMap).find(([key]) => userAgent.includes(key))
  if (matchedDevice) {
    return { method: ClientConnectionMethod.LAN, ip, port, ...matchedDevice[1] }
  }

  // Default to unknown
  return {
    method: ClientConnectionMethod.LAN,
    ip,
    port,
    id: ClientPlatformIDs.Unknown,
    name: 'unknown'
  }
}
