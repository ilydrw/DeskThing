import express from 'express'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { request } from 'node:http'
import { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ExpressServer } from '@server/stores/platforms/websocket/expressWorker'

let tempDirectory: string
let expressServer: ExpressServer
let port: number

const requestPath = (path: string): Promise<{ body: string; status: number }> =>
  new Promise((resolve, reject) => {
    const outgoingRequest = request(
      {
        headers: { connection: 'close' },
        host: '127.0.0.1',
        path,
        port
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
  tempDirectory = await mkdtemp(join(tmpdir(), 'deskthing-express-'))
  const serverResources = join(tempDirectory, 'apps', 'test-app', 'server')
  await mkdir(serverResources, { recursive: true })
  await writeFile(join(serverResources, 'public.txt'), 'public')
  await writeFile(join(tempDirectory, 'private.txt'), 'private')

  expressServer = new ExpressServer(express(), tempDirectory, 0, '127.0.0.1')
  expressServer.initializeServer()
  const server = expressServer.getServer()
  if (!server) throw new Error('Express server did not initialize')
  if (!server.listening) {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
    })
  }
  port = (server.address() as AddressInfo).port
})

afterEach(async () => {
  await expressServer.shutdown()
  await rm(tempDirectory, { recursive: true, force: true })
})

describe('ExpressServer resource boundary', () => {
  it('binds to the configured address and serves in-root generated resources', async () => {
    const address = expressServer.getServer()?.address() as AddressInfo
    expect(address.address).toBe('127.0.0.1')

    await expect(requestPath('/gen/test-app/public.txt')).resolves.toEqual({
      body: 'public',
      status: 200
    })
  })

  it('rejects encoded traversal outside an app resource directory', async () => {
    const response = await requestPath('/gen/test-app/%2e%2e%2f%2e%2e%2fprivate.txt')

    expect(response.status).toBe(400)
    expect(response.body).not.toContain('private')
  })
})
