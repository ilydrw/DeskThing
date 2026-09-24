import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appendBoundedLogFile,
  mergePersistedLogs,
  pruneLogArchives,
  truncateLogMessage
} from '@server/utils/logRetention'

const tempDirectories: string[] = []

const createTempDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'deskthing-log-retention-'))
  tempDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('log retention', () => {
  it('retains the newest persisted entries in chronological order', () => {
    expect(mergePersistedLogs([1, 2, 3], [4, 5], 3)).toEqual([3, 4, 5])
  })

  it('bounds oversized individual messages', () => {
    expect(truncateLogMessage('123456', 4)).toBe('1234… [truncated]')
  })

  it('rotates readable logs before they exceed the configured size', async () => {
    const directory = await createTempDirectory()
    const filePath = join(directory, 'readable.log')
    await writeFile(filePath, '12345678')

    await appendBoundedLogFile(filePath, 'abcd', 10)

    expect(await readFile(filePath, 'utf8')).toBe('abcd')
    const archives = (await readdir(directory)).filter((name) => name.startsWith('readable.log.'))
    expect(archives).toHaveLength(1)
    expect(await readFile(join(directory, archives[0]), 'utf8')).toBe('12345678')
  })

  it('removes archives beyond the retention limit', async () => {
    const directory = await createTempDirectory()
    const filePath = join(directory, 'application.log.json')

    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        writeFile(`${filePath}.2026-07-2${index}`, String(index))
      )
    )

    await pruneLogArchives(filePath, 2)

    const archives = (await readdir(directory)).filter((name) =>
      name.startsWith('application.log.json.')
    )
    expect(archives).toHaveLength(2)
  })
})
