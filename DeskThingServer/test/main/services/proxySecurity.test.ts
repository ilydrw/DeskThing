import { createServer } from 'node:http'
import { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchProxyResource,
  isPrivateNetworkAddress,
  ProxyHostResolver,
  validateProxyUrl
} from '@server/services/proxy/proxySecurity'

const publicResolver: ProxyHostResolver = async () => [{ address: '93.184.216.34', family: 4 }]

afterEach(() => {
  vi.restoreAllMocks()
})

describe('proxy URL validation', () => {
  it('rejects unsupported protocols and embedded credentials', async () => {
    await expect(validateProxyUrl('file:///etc/passwd')).rejects.toMatchObject({
      statusCode: 400
    })
    await expect(validateProxyUrl('https://user:password@example.com')).rejects.toMatchObject({
      statusCode: 400
    })
  })

  it.each([
    '127.0.0.1',
    '169.254.169.254',
    '10.0.0.1',
    '192.168.1.1',
    '::1',
    '::ffff:7f00:1',
    'fc00::1',
    'fe80::1'
  ])('classifies %s as a private network address', (address) => {
    expect(isPrivateNetworkAddress(address)).toBe(true)
  })

  it.each([
    'http://localhost',
    'http://127.0.0.1',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]',
    'http://[::ffff:127.0.0.1]'
  ])('blocks private target %s', async (url) => {
    await expect(validateProxyUrl(url)).rejects.toMatchObject({
      statusCode: 403
    })
  })

  it('blocks hostnames resolving to any private address', async () => {
    const mixedResolver: ProxyHostResolver = async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '127.0.0.1', family: 4 }
    ]

    await expect(
      validateProxyUrl('https://mixed.example', false, mixedResolver)
    ).rejects.toMatchObject({
      statusCode: 403
    })
  })

  it('accepts a public target and requires explicit opt-in for private targets', async () => {
    await expect(
      validateProxyUrl('https://example.com/image.jpg', false, publicResolver)
    ).resolves.toMatchObject({
      hostname: 'example.com',
      pathname: '/image.jpg'
    })

    const localResolver: ProxyHostResolver = async () => [{ address: '127.0.0.1', family: 4 }]
    await expect(
      validateProxyUrl('http://local-device.test', true, localResolver)
    ).resolves.toMatchObject({
      hostname: 'local-device.test'
    })
  })
})

describe('proxy fetching', () => {
  it('revalidates redirects and blocks a redirect to a private target', async () => {
    const fetchImplementation = vi.fn(async () => {
      return new Response(null, {
        headers: { location: 'http://127.0.0.1/private' },
        status: 302
      })
    }) as unknown as typeof fetch

    await expect(
      fetchProxyResource('https://example.com/start', {
        fetchImplementation,
        resolver: publicResolver
      })
    ).rejects.toMatchObject({
      statusCode: 403
    })
    expect(fetchImplementation).toHaveBeenCalledTimes(1)
  })

  it('pins the outbound connection to the validated DNS result', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/plain' })
      response.end('proxied')
    })

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })

    try {
      const address = server.address() as AddressInfo
      const resolver: ProxyHostResolver = async (hostname) => {
        expect(hostname).toBe('deskthing-proxy.test')
        return [{ address: '127.0.0.1', family: 4 }]
      }

      const response = await fetchProxyResource(
        `http://deskthing-proxy.test:${address.port}/resource`,
        {
          allowPrivateNetwork: true,
          resolver
        }
      )

      expect(response.status).toBe(200)
      await expect(response.text()).resolves.toBe('proxied')
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })
})
