import { createServer, request, Server } from 'node:http'
import { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsStoreClass } from '@shared/stores/settingsStore'

const mocks = vi.hoisted(() => ({
  getAppData: vi.fn(),
  getSetting: vi.fn(),
  initializeSettings: vi.fn(),
  settingsOn: vi.fn()
}))

vi.mock('@server/services/files/appFileService', () => ({
  getAppData: mocks.getAppData
}))

vi.mock('@server/utils/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  }
}))

import { AuthStore } from '@server/stores/authStore'

let authStore: AuthStore
let callbackPort: number

const reservePort = async (): Promise<number> => {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = (server.address() as AddressInfo).port
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
  return port
}

const requestCallback = (path: string): Promise<{ body: string; status: number }> =>
  new Promise((resolve, reject) => {
    const outgoingRequest = request(
      {
        headers: { connection: 'close' },
        host: '127.0.0.1',
        path,
        port: callbackPort
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => {
          resolve({
            body: Buffer.concat(chunks).toString('utf8'),
            status: response.statusCode ?? 0
          })
        })
      }
    )
    outgoingRequest.once('error', reject)
    outgoingRequest.end()
  })

beforeEach(async () => {
  vi.clearAllMocks()
  callbackPort = await reservePort()
  mocks.getSetting.mockResolvedValue(callbackPort)
  mocks.initializeSettings.mockResolvedValue(undefined)
  mocks.settingsOn.mockReturnValue(vi.fn())
  mocks.getAppData.mockResolvedValue({
    spotify: {
      enabled: true
    }
  })

  const settingsStore = {
    getSetting: mocks.getSetting,
    initialize: mocks.initializeSettings,
    on: mocks.settingsOn
  } as unknown as SettingsStoreClass
  authStore = new AuthStore(settingsStore)
  await authStore.initialize()
})

afterEach(async () => {
  const server = (authStore as unknown as { server: Server | null }).server
  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
})

describe('AuthStore callback boundary', () => {
  it('binds to loopback and emits a valid callback', async () => {
    const server = (authStore as unknown as { server: Server }).server
    expect((server.address() as AddressInfo).address).toBe('127.0.0.1')

    const callback = vi.fn()
    authStore.on('appData', callback)
    const response = await requestCallback('/callback/spotify?code=oauth-secret')

    expect(response.status).toBe(200)
    expect(callback).toHaveBeenCalledWith({
      app: 'spotify',
      callbackData: 'oauth-secret'
    })
  })

  it('rejects callbacks without an authorization code', async () => {
    const callback = vi.fn()
    authStore.on('appData', callback)

    const response = await requestCallback('/callback/spotify')

    expect(response.status).toBe(400)
    expect(callback).not.toHaveBeenCalled()
  })

  it('does not reflect an unknown app identifier into the response', async () => {
    const response = await requestCallback('/callback/%3Cscript%3E?code=test')

    expect(response.status).toBe(404)
    expect(response.body).not.toContain('<script>')
  })

  it('routes protocol callbacks by hostname only to enabled apps', async () => {
    const callback = vi.fn()
    authStore.on('appData', callback)

    await authStore.handleProtocol('deskthing://spotify?code=protocol-secret')

    expect(callback).toHaveBeenCalledWith({
      app: 'spotify',
      callbackData: 'protocol-secret'
    })
  })
})
