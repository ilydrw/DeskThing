import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { importLegacyProfile, LEGACY_IMPORT_MARKER } from '@server/services/initialize/legacyImport'
import { APP_ID, PRODUCT_NAME } from '@server/system/identity'

const mocks = vi.hoisted(() => ({ userDataPath: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => mocks.userDataPath),
    getVersion: vi.fn(() => '0.11.17')
  }
}))

vi.mock('@server/windows/loadingWindow', () => ({ updateLoadingStatus: vi.fn() }))

let root: string
let legacyDir: string
let targetDir: string

const snapshot = async (dir: string): Promise<Record<string, string>> => {
  const files: Record<string, string> = {}
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const path = join(entry.parentPath, entry.name)
    files[path.slice(dir.length)] = await readFile(path, 'utf8')
  }
  return files
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'deskthing-legacy-import-'))
  legacyDir = join(root, 'deskthing')
  targetDir = join(root, 'deskthing-community')
  mocks.userDataPath = targetDir

  await mkdir(join(legacyDir, 'apps', 'spotify'), { recursive: true })
  await mkdir(join(legacyDir, 'mappings'), { recursive: true })
  await mkdir(join(legacyDir, 'logs'), { recursive: true })
  await mkdir(join(legacyDir, 'flash'), { recursive: true })
  await mkdir(join(legacyDir, 'Cache'), { recursive: true })
  await writeFile(join(legacyDir, 'settings.json'), JSON.stringify({ version: '0.11.17' }))
  await writeFile(join(legacyDir, 'apps.json'), JSON.stringify({ spotify: { enabled: true } }))
  await writeFile(join(legacyDir, 'apps', 'spotify', 'manifest.json'), '{"id":"spotify"}')
  await writeFile(join(legacyDir, 'mappings', 'default.json'), '{"id":"default"}')
  await writeFile(join(legacyDir, 'logs', 'readable.log'), 'old log')
  await writeFile(join(legacyDir, 'flash', 'firmware.zip'), 'large download')
  await writeFile(join(legacyDir, 'Cache', 'data_0'), 'browser cache')
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('importLegacyProfile', () => {
  it('copies user data, skips caches, and leaves the original untouched', async () => {
    const before = await snapshot(legacyDir)

    const result = await importLegacyProfile({
      targetDir,
      legacyDirs: [join(root, 'missing'), legacyDir],
      now: () => new Date('2026-11-11T12:00:00.000Z')
    })

    expect(result.status).toBe('imported')
    expect(await snapshot(legacyDir)).toEqual(before)
    expect(JSON.parse(await readFile(join(targetDir, 'apps.json'), 'utf8'))).toEqual({
      spotify: { enabled: true }
    })
    expect(await readFile(join(targetDir, 'apps', 'spotify', 'manifest.json'), 'utf8')).toBe(
      '{"id":"spotify"}'
    )
    expect((await readdir(targetDir)).sort()).toEqual(
      ['apps', 'apps.json', LEGACY_IMPORT_MARKER, 'mappings', 'settings.json'].sort()
    )
    expect(JSON.parse(await readFile(join(targetDir, LEGACY_IMPORT_MARKER), 'utf8'))).toEqual({
      schemaVersion: 1,
      status: 'imported',
      recordedAt: '2026-11-11T12:00:00.000Z',
      sourcePath: legacyDir,
      sourceVersion: '0.11.17',
      entries: ['settings.json', 'apps.json', 'apps', 'mappings']
    })
  })

  it('runs only once, even after the original changes', async () => {
    await importLegacyProfile({ targetDir, legacyDirs: [legacyDir] })
    await writeFile(join(legacyDir, 'apps.json'), '{"changed":true}')
    await rm(join(targetDir, 'apps.json'))

    await expect(importLegacyProfile({ targetDir, legacyDirs: [legacyDir] })).resolves.toEqual({
      status: 'skipped',
      reason: 'already-recorded'
    })
    expect((await readdir(targetDir)).includes('apps.json')).toBe(false)
  })

  it('never overwrites a profile that already has data', async () => {
    await mkdir(targetDir, { recursive: true })
    await writeFile(join(targetDir, 'settings.json'), '{"version":"0.12.0"}')

    await expect(importLegacyProfile({ targetDir, legacyDirs: [legacyDir] })).resolves.toEqual({
      status: 'skipped',
      reason: 'existing-profile'
    })
    expect(await readFile(join(targetDir, 'settings.json'), 'utf8')).toBe('{"version":"0.12.0"}')
    expect((await readdir(targetDir)).sort()).toEqual([LEGACY_IMPORT_MARKER, 'settings.json'])
  })

  it('does nothing and records nothing when there is no original profile', async () => {
    await expect(
      importLegacyProfile({ targetDir, legacyDirs: [join(root, 'missing'), targetDir] })
    ).resolves.toEqual({ status: 'skipped', reason: 'no-legacy-profile' })
    await expect(readdir(targetDir)).rejects.toThrow()
  })

  it('rolls back a failed import so the next launch can retry', async () => {
    // A directory where the marker's temporary file must go makes the final step fail.
    await mkdir(join(targetDir, `${LEGACY_IMPORT_MARKER}.tmp`), { recursive: true })

    await expect(importLegacyProfile({ targetDir, legacyDirs: [legacyDir] })).rejects.toThrow()
    expect(await readdir(targetDir)).toEqual([`${LEGACY_IMPORT_MARKER}.tmp`])

    await rm(join(targetDir, `${LEGACY_IMPORT_MARKER}.tmp`), { recursive: true })
    await expect(
      importLegacyProfile({ targetDir, legacyDirs: [legacyDir] })
    ).resolves.toMatchObject({ status: 'imported' })
  })
})

describe('setAsideUnversionedData', () => {
  it('keeps data of an unknown version recoverable instead of deleting it', async () => {
    const { setAsideUnversionedData } = await import('@server/services/initialize/migrateDeskThing')
    await mkdir(join(targetDir, 'apps', 'spotify'), { recursive: true })
    await mkdir(join(targetDir, 'logs'), { recursive: true })
    await writeFile(join(targetDir, 'settings.json'), '{ damaged')
    await writeFile(join(targetDir, 'apps', 'spotify', 'manifest.json'), '{"id":"spotify"}')

    await setAsideUnversionedData(new Date('2026-11-11T12:00:00.000Z'))

    expect((await readdir(targetDir)).sort()).toEqual(['logs', 'recovery'])
    const recovery = join(targetDir, 'recovery', 'unversioned-2026-11-11T12-00-00-000Z')
    expect(await readFile(join(recovery, 'settings.json'), 'utf8')).toBe('{ damaged')
    expect(await readFile(join(recovery, 'apps', 'spotify', 'manifest.json'), 'utf8')).toBe(
      '{"id":"spotify"}'
    )
  })

  it('leaves a fresh profile alone', async () => {
    const { setAsideUnversionedData } = await import('@server/services/initialize/migrateDeskThing')
    await mkdir(join(targetDir, 'logs'), { recursive: true })
    await setAsideUnversionedData()
    expect(await readdir(targetDir)).toEqual(['logs'])
  })
})

describe('distribution identity', () => {
  it('matches the packaged application identity', () => {
    const packageJson = createRequire(import.meta.url)('../../../package.json')
    expect(packageJson.build.appId).toBe(APP_ID)
    expect(packageJson.build.productName).toBe(PRODUCT_NAME)
    expect(packageJson.build.appId).not.toBe('com.deskthing.app')
  })
})
