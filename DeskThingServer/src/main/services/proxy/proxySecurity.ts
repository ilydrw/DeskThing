import { lookup } from 'node:dns/promises'
import { request as httpRequest } from 'node:http'
import { BlockList, isIP, LookupFunction } from 'node:net'
import { request as httpsRequest } from 'node:https'
import { Readable } from 'node:stream'

export const MAX_PROXY_RESPONSE_BYTES = 25 * 1024 * 1024
export const PROXY_REQUEST_TIMEOUT_MS = 15_000
const MAX_PROXY_REDIRECTS = 3

export class ProxyRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message)
    this.name = 'ProxyRequestError'
  }
}

export type ProxyHostResolver = (
  hostname: string
) => Promise<ReadonlyArray<{ address: string; family: number }>>

const defaultResolver: ProxyHostResolver = async (hostname) =>
  lookup(hostname, { all: true, verbatim: true })

const privateIpv4BlockList = new BlockList()
const privateIpv6BlockList = new BlockList()

const privateIpv4Subnets: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
]

const privateIpv6Subnets: ReadonlyArray<readonly [string, number]> = [
  ['::', 128],
  ['::1', 128],
  ['::', 96],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8]
]

for (const [network, prefix] of privateIpv4Subnets) {
  privateIpv4BlockList.addSubnet(network, prefix, 'ipv4')
}
for (const [network, prefix] of privateIpv6Subnets) {
  privateIpv6BlockList.addSubnet(network, prefix, 'ipv6')
}

const normalizeHostname = (hostname: string): string =>
  hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname

export const isPrivateNetworkAddress = (address: string): boolean => {
  const normalized = normalizeHostname(address).split('%')[0]
  const family = isIP(normalized)
  if (family === 4) return privateIpv4BlockList.check(normalized, 'ipv4')
  if (family === 6) return privateIpv6BlockList.check(normalized, 'ipv6')
  return true
}

const isLocalHostname = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase().replace(/\.$/, '')
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal') ||
    normalized.endsWith('.home.arpa')
  )
}

interface ResolvedProxyTarget {
  url: URL
  addresses: ReadonlyArray<{ address: string; family: number }>
}

const resolveProxyTarget = async (
  rawUrl: string,
  allowPrivateNetwork = false,
  resolver: ProxyHostResolver = defaultResolver
): Promise<ResolvedProxyTarget> => {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new ProxyRequestError('Proxy URL is invalid', 400)
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ProxyRequestError('Proxy URL must use HTTP or HTTPS', 400)
  }
  if (url.username || url.password) {
    throw new ProxyRequestError('Proxy URLs cannot contain credentials', 400)
  }
  if (!allowPrivateNetwork && isLocalHostname(url.hostname)) {
    throw new ProxyRequestError('Private network proxy targets are disabled', 403)
  }

  const hostname = normalizeHostname(url.hostname)
  const literalIpFamily = isIP(hostname)
  let addresses: ReadonlyArray<{ address: string; family: number }>
  try {
    addresses = literalIpFamily
      ? [{ address: hostname, family: literalIpFamily }]
      : await resolver(hostname)
  } catch {
    throw new ProxyRequestError('Proxy target could not be resolved', 502)
  }

  if (
    addresses.length === 0 ||
    addresses.some(({ address, family }) => {
      const detectedFamily = isIP(normalizeHostname(address).split('%')[0])
      return detectedFamily === 0 || detectedFamily !== family
    })
  ) {
    throw new ProxyRequestError('Proxy target returned an invalid address', 502)
  }

  if (!allowPrivateNetwork && addresses.some(({ address }) => isPrivateNetworkAddress(address))) {
    throw new ProxyRequestError('Private network proxy targets are disabled', 403)
  }

  return { url, addresses }
}

export const validateProxyUrl = async (
  rawUrl: string,
  allowPrivateNetwork = false,
  resolver: ProxyHostResolver = defaultResolver
): Promise<URL> => (await resolveProxyTarget(rawUrl, allowPrivateNetwork, resolver)).url

export interface ProxyFetchOptions {
  allowPrivateNetwork?: boolean
  resolver?: ProxyHostResolver
  fetchImplementation?: typeof fetch
}

const requestPinnedProxyTarget = (
  url: URL,
  addresses: ReadonlyArray<{ address: string; family: number }>
): Promise<Response> =>
  new Promise((resolve, reject) => {
    const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
      const requestedFamily =
        typeof options.family === 'number' && options.family !== 0 ? options.family : null
      const candidates = requestedFamily
        ? addresses.filter(({ family }) => family === requestedFamily)
        : addresses

      if (candidates.length === 0) {
        const error = new Error('No validated address matches the requested family')
        Object.assign(error, { code: 'ENOTFOUND' })
        callback(error, '')
        return
      }

      if (options.all) {
        callback(
          null,
          candidates.map(({ address, family }) => ({ address, family }))
        )
        return
      }

      callback(null, candidates[0].address, candidates[0].family)
    }

    const requestFactory = url.protocol === 'https:' ? httpsRequest : httpRequest
    const signal = AbortSignal.timeout(PROXY_REQUEST_TIMEOUT_MS)
    const request = requestFactory(
      url,
      {
        headers: {
          accept: '*/*',
          'accept-encoding': 'identity'
        },
        lookup: pinnedLookup,
        method: 'GET',
        signal
      },
      (incomingResponse) => {
        const status = incomingResponse.statusCode ?? 502
        if (status < 200 || status > 599) {
          incomingResponse.destroy()
          reject(new ProxyRequestError('Proxy target returned an invalid response', 502))
          return
        }

        const headers = new Headers()
        for (const [name, value] of Object.entries(incomingResponse.headers)) {
          if (Array.isArray(value)) {
            for (const item of value) headers.append(name, item)
          } else if (value !== undefined) {
            headers.set(name, value)
          }
        }

        const hasBody = status !== 204 && status !== 205 && status !== 304
        const body = hasBody
          ? (Readable.toWeb(incomingResponse) as ReadableStream<Uint8Array>)
          : null
        resolve(
          new Response(body, {
            headers,
            status,
            statusText: incomingResponse.statusMessage
          })
        )
      }
    )

    request.once('error', (_error) => {
      if (signal.aborted) {
        reject(new ProxyRequestError('Proxy target timed out', 504))
      } else {
        reject(new ProxyRequestError('Proxy target could not be reached', 502))
      }
    })
    request.end()
  })

export const fetchProxyResource = async (
  rawUrl: string,
  options: ProxyFetchOptions = {}
): Promise<Response> => {
  const resolver = options.resolver ?? defaultResolver
  let currentTarget = await resolveProxyTarget(
    rawUrl,
    options.allowPrivateNetwork ?? false,
    resolver
  )

  for (let redirects = 0; redirects <= MAX_PROXY_REDIRECTS; redirects += 1) {
    const response = options.fetchImplementation
      ? await options.fetchImplementation(currentTarget.url, {
          redirect: 'manual',
          signal: AbortSignal.timeout(PROXY_REQUEST_TIMEOUT_MS)
        })
      : await requestPinnedProxyTarget(currentTarget.url, currentTarget.addresses)

    if (response.status < 300 || response.status >= 400) return response

    const location = response.headers.get('location')
    if (!location) return response
    await response.body?.cancel()
    if (redirects === MAX_PROXY_REDIRECTS) {
      throw new ProxyRequestError('Proxy target exceeded the redirect limit', 502)
    }

    currentTarget = await resolveProxyTarget(
      new URL(location, currentTarget.url).toString(),
      options.allowPrivateNetwork ?? false,
      resolver
    )
  }

  throw new ProxyRequestError('Proxy target could not be resolved', 502)
}
