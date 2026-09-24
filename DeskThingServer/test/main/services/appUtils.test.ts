import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAppFilePath, getStandardizedFilename } from '@server/services/apps/appUtils'

const mocks = vi.hoisted(() => ({
  userDataPath: ''
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => mocks.userDataPath)
  }
}))

vi.mock('@server/utils/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn()
  }
}))

beforeEach(() => {
  mocks.userDataPath = resolve('test-user-data')
})

describe('app path construction', () => {
  it('keeps normal app resources inside the app directory', () => {
    expect(getAppFilePath('spotify', 'server/index.js')).toBe(
      resolve(mocks.userDataPath, 'apps', 'spotify', 'server', 'index.js')
    )
    expect(getStandardizedFilename('spotify', '1.2.3')).toBe('spotify-v1.2.3.zip')
  })

  it.each(['..', '../outside', '..\\outside', 'name:stream'])(
    'rejects unsafe app identifier %j',
    (appId) => {
      expect(() => getAppFilePath(appId)).toThrow()
      expect(() => getStandardizedFilename(appId, '1.2.3')).toThrow()
    }
  )

  it('rejects resource paths that escape an otherwise valid app', () => {
    expect(() => getAppFilePath('spotify', '../../private.json')).toThrow()
  })
})
