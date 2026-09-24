import { describe, expect, it } from 'vitest'
import { parseDistributionConfig, readServiceValue } from '@server/config/distributionConfig'

describe('public distribution configuration', () => {
  it('allows an unconfigured development fork', () => {
    expect(parseDistributionConfig({})).toEqual({})
  })

  it('normalizes owned repositories and update feeds', () => {
    expect(
      parseDistributionConfig({
        DESKTHING_APP_CATALOG_REPOSITORY: ' https://github.com/example/apps/ ',
        DESKTHING_UPDATE_FEED_URL: 'https://updates.example.test/stable/'
      })
    ).toEqual({
      DESKTHING_APP_CATALOG_REPOSITORY: 'https://github.com/example/apps',
      DESKTHING_UPDATE_FEED_URL: 'https://updates.example.test/stable'
    })
  })

  it.each([null, [], 'url', 42])('rejects a non-object document: %j', (input) => {
    expect(() => parseDistributionConfig(input)).toThrow('JSON object')
  })

  it.each([
    'DESKTHING_SUPPORTER_TOKEN',
    'DESKTHING_STATS_PRIVATE_KEY',
    'DESKTHING_STATS_URL',
    'DESKTHING_PROXY_ALLOW_PRIVATE_NETWORK',
    'typo'
  ])('rejects private, privacy, or unknown setting %s', (key) => {
    expect(() => parseDistributionConfig({ [key]: 'not-for-distribution' })).toThrow('Unsupported')
  })

  it.each(['', ' ', null, false, 123])('rejects invalid setting value %j', (value) => {
    expect(() => parseDistributionConfig({ DESKTHING_UPDATE_FEED_URL: value })).toThrow(
      'nonempty string'
    )
  })

  it.each([
    'http://example.test/feed',
    'file:///tmp/feed',
    'not-a-url',
    'https://user:password@example.test/feed',
    'https://example.test/feed?token=secret',
    'https://example.test/feed#fragment'
  ])('rejects unsafe bundled URL %s', (url) => {
    expect(() => parseDistributionConfig({ DESKTHING_UPDATE_FEED_URL: url })).toThrow('HTTPS')
  })

  it.each([
    'https://example.test/owner/repo',
    'https://github.com/owner',
    'https://github.com/owner/repo/releases',
    'https://github.com:8443/owner/repo'
  ])('rejects unsupported catalog %s', (url) => {
    expect(() => parseDistributionConfig({ DESKTHING_CLIENT_CATALOG_REPOSITORY: url })).toThrow(
      'owner/repository'
    )
  })

  it('requires a matching driver URL and valid digest', () => {
    const url = 'https://downloads.example.test/driver.exe'
    expect(() => parseDistributionConfig({ DESKTHING_DRIVER_INSTALLER_URL: url })).toThrow(
      'together'
    )
    expect(() =>
      parseDistributionConfig({ DESKTHING_DRIVER_INSTALLER_SHA256: 'a'.repeat(64) })
    ).toThrow('together')
    expect(() =>
      parseDistributionConfig({
        DESKTHING_DRIVER_INSTALLER_URL: url,
        DESKTHING_DRIVER_INSTALLER_SHA256: 'bad'
      })
    ).toThrow('64 hexadecimal')
    expect(
      parseDistributionConfig({
        DESKTHING_DRIVER_INSTALLER_URL: url,
        DESKTHING_DRIVER_INSTALLER_SHA256: 'A'.repeat(64)
      }).DESKTHING_DRIVER_INSTALLER_SHA256
    ).toBe('a'.repeat(64))
  })

  it('uses bundled defaults without requiring an environment file', () => {
    const defaults = parseDistributionConfig({
      DESKTHING_UPDATE_FEED_URL: 'https://example.test/updates'
    })
    expect(readServiceValue('DESKTHING_UPDATE_FEED_URL', defaults, {})).toBe(
      'https://example.test/updates'
    )
    expect(
      readServiceValue('DESKTHING_UPDATE_FEED_URL', defaults, { DESKTHING_UPDATE_FEED_URL: '' })
    ).toBe('')
    expect(
      readServiceValue('DESKTHING_UPDATE_FEED_URL', defaults, {
        DESKTHING_UPDATE_FEED_URL: 'https://custom.example.test/feed'
      })
    ).toBe('https://custom.example.test/feed')
    expect(readServiceValue('DESKTHING_SUPPORTER_TOKEN', defaults, {})).toBeUndefined()
    expect(readServiceValue('toString', defaults, {})).toBeUndefined()
  })
})
