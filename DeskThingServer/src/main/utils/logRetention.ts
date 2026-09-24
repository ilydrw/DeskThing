import { appendFile, readdir, rename, stat, unlink } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

export const MAX_PERSISTED_LOGS = 2_000
export const MAX_PERSISTED_MESSAGE_LENGTH = 10_000
export const MAX_READABLE_LOG_BYTES = 5 * 1024 * 1024
export const MAX_ARCHIVED_LOG_FILES = 3

const isMissingFileError = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT'

export const truncateLogMessage = (
  message: string,
  maxLength = MAX_PERSISTED_MESSAGE_LENGTH
): string => {
  if (message.length <= maxLength) return message
  return `${message.slice(0, maxLength)}… [truncated]`
}

export const mergePersistedLogs = <T>(existing: T[], pending: T[], maxLogs: number): T[] =>
  [...existing, ...pending].slice(-maxLogs)

export const pruneLogArchives = async (
  filePath: string,
  maxArchives = MAX_ARCHIVED_LOG_FILES
): Promise<void> => {
  const directory = dirname(filePath)
  const archivePrefix = `${basename(filePath)}.`
  const entries = await readdir(directory, { withFileTypes: true })
  const archiveNames = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(archivePrefix))
    .map((entry) => entry.name)

  const archives = await Promise.all(
    archiveNames.map(async (name) => {
      const archivePath = join(directory, name)
      const fileStats = await stat(archivePath)
      return { path: archivePath, modifiedAt: fileStats.mtimeMs }
    })
  )

  archives.sort((a, b) => b.modifiedAt - a.modifiedAt)
  await Promise.all(archives.slice(maxArchives).map((archive) => unlink(archive.path)))
}

export const rotateLogFile = async (
  filePath: string,
  maxArchives = MAX_ARCHIVED_LOG_FILES
): Promise<boolean> => {
  try {
    const fileStats = await stat(filePath)
    if (fileStats.size === 0) return false

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    await rename(filePath, `${filePath}.${timestamp}`)
    await pruneLogArchives(filePath, maxArchives)
    return true
  } catch (error) {
    if (isMissingFileError(error)) return false
    throw error
  }
}

export const appendBoundedLogFile = async (
  filePath: string,
  content: string,
  maxBytes = MAX_READABLE_LOG_BYTES
): Promise<void> => {
  const contentBuffer = Buffer.from(content)
  const boundedContent =
    contentBuffer.length > maxBytes
      ? contentBuffer.subarray(contentBuffer.length - maxBytes).toString('utf8')
      : content
  const contentBytes = Buffer.byteLength(boundedContent)

  let currentBytes = 0
  try {
    currentBytes = (await stat(filePath)).size
  } catch (error) {
    if (!isMissingFileError(error)) throw error
  }

  if (currentBytes > 0 && currentBytes + contentBytes > maxBytes) {
    await rotateLogFile(filePath)
  }

  await appendFile(filePath, boundedContent, 'utf8')
}
