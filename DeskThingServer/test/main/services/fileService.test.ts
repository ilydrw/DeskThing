import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteFile, readFromFile, updateFile, writeToFile } from '@server/services/files/fileService'

const mocks = vi.hoisted(() => ({
  userDataPath: '',
  tempPath: ''
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => (name === 'temp' ? mocks.tempPath : mocks.userDataPath))
  }
}))

vi.mock('@server/utils/logger', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

const tempDirectories: string[] = []

beforeEach(async () => {
  mocks.userDataPath = await mkdtemp(join(tmpdir(), 'deskthing-file-service-'))
  mocks.tempPath = await mkdtemp(join(tmpdir(), 'deskthing-file-temp-'))
  tempDirectories.push(mocks.userDataPath, mocks.tempPath)
})

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('recoverable persistence', () => {
  it('returns undefined for a missing file', async () => {
    await expect(readFromFile('missing.json')).resolves.toBeUndefined()
  })

  it.each(['', '   ', '{"devices":', 'not json', 'null', '\0'.repeat(6093)])(
    'preserves invalid original bytes and allows defaults: %j',
    async (content) => {
      await writeFile(join(mocks.userDataPath, 'state.json'), content)
      await expect(readFromFile('state.json')).resolves.toBeUndefined()
      const backups = (await readdir(mocks.userDataPath)).filter((name) => name.includes('.corrupt-'))
      expect(backups).toHaveLength(1)
      expect(await readFile(join(mocks.userDataPath, backups[0]), 'utf8')).toBe(content)
      await writeToFile({ recovered: true }, 'state.json')
      expect(await readFromFile('state.json')).toEqual({ recovered: true })
    }
  )

  it('accepts a UTF-8 BOM', async () => {
    await writeFile(join(mocks.userDataPath, 'state.json'), '\uFEFF{"value":1}')
    expect(await readFromFile('state.json')).toEqual({ value: 1 })
  })

  it('preserves valid JSON with an invalid schema', async () => {
    await writeToFile({ devices: 'wrong type' }, 'state.json')
    expect(await readFromFile('state.json', () => { throw new Error('Invalid devices') })).toBeUndefined()
    expect((await readdir(mocks.userDataPath)).some((name) => name.includes('.corrupt-'))).toBe(true)
  })

  it('keeps the committed file when replacement fails and continues the queue', async () => {
    await writeToFile({ value: 1 }, 'state.json')
    const rename = vi.spyOn(fs.promises, 'rename').mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'EPERM' }))
    await expect(writeToFile({ value: 2 }, 'state.json')).rejects.toThrow('Cannot replace')
    expect(await readFromFile('state.json')).toEqual({ value: 1 })
    expect(await readdir(mocks.userDataPath)).toEqual(['state.json'])
    rename.mockRestore()
    await writeToFile({ value: 3 }, 'state.json')
    expect(await readFromFile('state.json')).toEqual({ value: 3 })
  })

  it('never overwrites state after a permission failure until a successful read', async () => {
    await writeToFile({ value: 1 }, 'state.json')
    const read = vi.spyOn(fs.promises, 'readFile').mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'EACCES' }))
    await expect(readFromFile('state.json')).rejects.toThrow('Cannot read')
    await expect(writeToFile({ value: 2 }, 'state.json')).rejects.toThrow('Refusing to overwrite')
    read.mockRestore()
    expect(await readFromFile('state.json')).toEqual({ value: 1 })
    await writeToFile({ value: 3 }, 'state.json')
  })

  it('refuses recovery when the corrupt original cannot be preserved', async () => {
    await writeFile(join(mocks.userDataPath, 'state.json'), '{')
    vi.spyOn(fs.promises, 'rename').mockRejectedValueOnce(new Error('denied'))
    await expect(readFromFile('state.json')).rejects.toThrow('Cannot preserve')
    await expect(writeToFile({}, 'state.json')).rejects.toThrow('Refusing to overwrite')
    expect(await readFile(join(mocks.userDataPath, 'state.json'), 'utf8')).toBe('{')
  })

  it('serializes transactions across equivalent paths without losing updates', async () => {
    await Promise.all(Array.from({ length: 30 }, (_, index) => updateFile<{ count: number }>(
      index % 2 ? './state.json' : 'state.json',
      (current) => ({ count: (current?.count ?? 0) + 1 })
    )))
    expect(await readFromFile('state.json')).toEqual({ count: 30 })
  })

  it('snapshots mutable values at the time a save is requested', async () => {
    const state = { value: 1 }
    const saving = writeToFile(state, 'state.json')
    state.value = 2
    await saving
    expect(await readFromFile('state.json')).toEqual({ value: 1 })
  })

  it('rejects unserializable data without touching the committed file', async () => {
    await writeToFile({ value: 1 }, 'state.json')
    await expect(writeToFile(undefined, 'state.json')).rejects.toThrow('Cannot serialize')
    expect(await readFromFile('state.json')).toEqual({ value: 1 })
  })
})

describe('file service confinement', () => {
  it('reads, writes, and deletes normal user-data files', async () => {
    await writeToFile({ value: 1 }, 'settings/example.json')

    await expect(readFromFile('settings/example.json')).resolves.toEqual({ value: 1 })
    await expect(
      readFile(join(mocks.userDataPath, 'settings', 'example.json'), 'utf8')
    ).resolves.toContain('"value": 1')

    await deleteFile('settings/example.json')
    await expect(
      readFile(join(mocks.userDataPath, 'settings', 'example.json'))
    ).rejects.toMatchObject({
      code: 'ENOENT'
    })
  })

  it.each(['../outside.json', '..\\outside.json', '.', ''])(
    'rejects path outside the user-data root: %j',
    async (filePath) => {
      await expect(writeToFile({ value: 1 }, filePath)).rejects.toThrow(
        'within the user data directory'
      )
    }
  )
})
