import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClientManifest } from '@deskthing/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userDataPath: '',
  debug: vi.fn(),
  error: vi.fn(),
  warn: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => mocks.userDataPath)
  }
}))

vi.mock('@server/utils/logger', () => ({
  default: {
    debug: mocks.debug,
    error: mocks.error,
    warn: mocks.warn
  }
}))

vi.mock('@server/services/events/progressBus', () => ({
  progressBus: {
    complete: vi.fn(),
    error: vi.fn(),
    start: vi.fn(),
    update: vi.fn(),
    warn: vi.fn()
  }
}))

import { getClientManifest, updateManifest } from '@server/services/client/clientService'

const manifest: ClientManifest = {
  author: 'DeskThing',
  compatibility: {
    app: '>=0.11.0',
    server: '>=0.11.7'
  },
  connectionId: 'device-id',
  context: {
    id: 4,
    ip: 'localhost',
    method: 3,
    name: 'Car Thing',
    port: 8891
  },
  description: 'DeskThing client',
  id: 'deskthing',
  name: 'DeskThing Client',
  reactive: true,
  repository: 'https://github.com/ItsRiprod/Deskthing-Client/',
  short_name: 'DT',
  version: '0.11.2'
}

let webappPath: string

beforeEach(async () => {
  mocks.userDataPath = await mkdtemp(join(tmpdir(), 'deskthing-client-service-'))
  webappPath = join(mocks.userDataPath, 'webapp')
  await mkdir(webappPath, { recursive: true })
  vi.clearAllMocks()
})

afterEach(async () => {
  await rm(mocks.userDataPath, { recursive: true, force: true })
})

describe('client manifest persistence', () => {
  it('recovers an empty manifest from manifest.js and preserves its dynamic fields', async () => {
    await writeFile(join(webappPath, 'manifest.json'), '')
    await writeFile(
      join(webappPath, 'manifest.js'),
      `window.manifest = ${JSON.stringify(manifest, null, 2)};\n` +
        `document.dispatchEvent(new Event('manifestLoaded'))`
    )

    await expect(getClientManifest()).resolves.toEqual(manifest)
    await expect(readFile(join(webappPath, 'manifest.json'), 'utf8')).resolves.toBe(
      JSON.stringify(manifest)
    )
    expect(mocks.warn).toHaveBeenCalledWith(
      'Recovered the installed client manifest from manifest.js',
      expect.any(Object)
    )
  })

  it('falls back to the packaged default when manifest.js is unavailable', async () => {
    await writeFile(join(webappPath, 'manifest.json'), '{')
    await writeFile(join(webappPath, 'manifest.default.json'), JSON.stringify(manifest))

    await expect(getClientManifest()).resolves.toEqual(manifest)
    expect(mocks.warn).toHaveBeenCalledWith(
      'Recovered the installed client manifest from manifest.default.json',
      expect.any(Object)
    )
  })

  it('returns null when no valid client package is installed', async () => {
    await expect(getClientManifest()).resolves.toBeNull()
    expect(mocks.debug).toHaveBeenCalledWith('No device client is installed', expect.any(Object))
  })

  it('serializes updates and leaves a complete manifest without temporary files', async () => {
    await writeFile(join(webappPath, 'manifest.json'), JSON.stringify(manifest))

    await Promise.all([
      updateManifest({ connectionId: 'updated-device' }),
      updateManifest({ context: { ...manifest.context, port: 9000 } })
    ])

    const updatedManifest = JSON.parse(
      await readFile(join(webappPath, 'manifest.json'), 'utf8')
    ) as ClientManifest
    expect(updatedManifest.connectionId).toBe('updated-device')
    expect(updatedManifest.context.port).toBe(9000)
    expect((await readdir(webappPath)).filter((file) => file.endsWith('.tmp'))).toEqual([])
  })

  it('rejects an update when no valid client package is installed', async () => {
    await expect(updateManifest({ connectionId: 'missing-client' })).rejects.toThrow(
      'Cannot update the client manifest because no valid client is installed'
    )
    expect(mocks.error).toHaveBeenCalledWith(
      'Error updating client manifest:',
      expect.objectContaining({ error: expect.any(Error) })
    )
  })
})
