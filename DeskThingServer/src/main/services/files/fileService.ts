import { app } from 'electron'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import Logger from '@server/utils/logger'
import { resolvePathWithinRoot } from '@server/utils/pathSecurity'

export class FileServiceError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'FileServiceError'
  }
}

const getUserDataFilePath = (relativePath: string): string => {
  const userDataPath = resolve(app.getPath('userData'))
  // POSIX treats `\` as a filename character, so `..\x` would silently become a file named
  // `..\x` on Linux/macOS while escaping the root on Windows. Normalize so every platform
  // interprets user-data paths the same way.
  const portablePath = relativePath.replaceAll('\\', '/')
  const filePath = resolvePathWithinRoot(userDataPath, portablePath)
  if (!filePath || filePath === userDataPath) {
    throw new FileServiceError('File path must remain within the user data directory')
  }
  return filePath
}

// Use the resolved path so aliases (including Windows casing) share one queue.
const pathKey = (path: string): string => (process.platform === 'win32' ? path.toLowerCase() : path)
const pending = new Map<string, Promise<void>>()
const unreadable = new Set<string>()

const enqueue = <T>(path: string, operation: () => Promise<T>): Promise<T> => {
  const key = pathKey(path)
  const result = (pending.get(key) ?? Promise.resolve()).then(operation)
  const settled = result.then(
    () => undefined,
    () => undefined
  )
  pending.set(key, settled)
  void settled.then(() => {
    if (pending.get(key) === settled) pending.delete(key)
  })
  return result
}

const hasCode = (error: unknown, code: string): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === code

export type FileValidator = (value: unknown) => void

const readJson = async <T>(path: string, validate?: FileValidator): Promise<T | undefined> => {
  let raw: string
  try {
    raw = await fs.promises.readFile(path, 'utf8')
  } catch (error) {
    if (hasCode(error, 'ENOENT')) {
      unreadable.delete(pathKey(path))
      return undefined
    }
    unreadable.add(pathKey(path))
    throw new FileServiceError('[readFromFile] Cannot read ' + path, error)
  }

  let value: unknown
  try {
    // Accept UTF-8 BOMs written by Windows editors and older tools.
    value = JSON.parse(raw.replace(/^\uFEFF/, ''))
    if (value === null) throw new Error('Expected persisted data, received null')
    validate?.(value)
  } catch {
    const backupPath = path + '.corrupt-' + Date.now() + '-' + randomUUID() + '.bak'
    try {
      // Keep the original bytes before a caller creates defaults. Never log their contents.
      await fs.promises.rename(path, backupPath)
    } catch (error) {
      unreadable.add(pathKey(path))
      throw new FileServiceError('[readFromFile] Cannot preserve invalid data in ' + path, error)
    }
    unreadable.delete(pathKey(path))
    Logger.warn('Invalid persisted data in ' + path + '; original preserved at ' + backupPath, {
      source: 'FileService',
      function: 'readFromFile'
    })
    return undefined
  }
  unreadable.delete(pathKey(path))
  // Callers with a known schema provide its runtime validator at this boundary.
  return value as T
}

const serialize = (data: unknown, path: string): string => {
  try {
    const json = JSON.stringify(data, null, 2)
    if (json === undefined) throw new Error('Value is not JSON serializable')
    return json
  } catch (error) {
    throw new FileServiceError('[writeToFile] Cannot serialize data for ' + path, error)
  }
}

const writeJson = async (path: string, json: string): Promise<void> => {
  if (unreadable.has(pathKey(path))) {
    throw new FileServiceError(
      '[writeToFile] Refusing to overwrite unreadable data in ' + path + '; restore access and read it again first'
    )
  }
  const tempPath = path + '.' + randomUUID() + '.tmp'
  try {
    await fs.promises.mkdir(dirname(path), { recursive: true })
    // Same-directory rename is atomic for both first creation and replacement.
    const file = await fs.promises.open(tempPath, 'wx', 0o600)
    try {
      await file.writeFile(json, 'utf8')
      await file.sync()
    } finally {
      await file.close()
    }
    await fs.promises.rename(tempPath, path)
  } catch (error) {
    throw new FileServiceError('[writeToFile] Cannot replace ' + path, error)
  } finally {
    try {
      await fs.promises.rm(tempPath, { force: true })
    } catch (error) {
      Logger.warn('Unable to remove temporary file ' + tempPath, {
        source: 'FileService',
        function: 'writeToFile',
        error: error instanceof Error ? error : new Error(String(error))
      })
    }
  }
}

/** Missing or preserved-invalid state returns undefined; filesystem failures remain errors. */
export const readFromFile = async <T>(
  filename: string,
  validate?: FileValidator
): Promise<T | undefined> => {
  const path = getUserDataFilePath(filename)
  return enqueue(path, () => readJson<T>(path, validate))
}

export const writeToFile = async <T>(data: T, filepath: string): Promise<void> => {
  const path = getUserDataFilePath(filepath)
  // Snapshot now, rather than serializing a mutable store later when its queue runs.
  const json = serialize(data, path)
  return enqueue(path, () => writeJson(path, json))
}

/** Serialize the entire read/modify/write transaction to prevent lost updates. */
export const updateFile = async <T>(
  filename: string,
  update: (current: T | undefined) => T,
  validate?: FileValidator
): Promise<T> => {
  const path = getUserDataFilePath(filename)
  return enqueue(path, async () => {
    const next = update(await readJson<T>(path, validate))
    validate?.(next)
    await writeJson(path, serialize(next, path))
    return next
  })
}

export const addToFile = async (data: string | Buffer, filepath: string): Promise<void> => {
  const path = getUserDataFilePath(filepath)
  return enqueue(path, async () => {
    try {
      await fs.promises.mkdir(dirname(path), { recursive: true })
      await fs.promises.appendFile(path, data.toString() + '\n')
    } catch (error) {
      throw new FileServiceError('[addToFile] Cannot append to ' + path, error)
    }
  })
}

/** @deprecated Use writeToFile. Paths are confined to userData. */
export const writeToGlobalFile = writeToFile

/** @deprecated Use readFromFile. */
export const readFromGlobalFile = async <T>(filename: string): Promise<T | false> =>
  (await readFromFile<T>(filename)) ?? false

export const deleteFile = async (filename: string): Promise<void> => {
  const path = getUserDataFilePath(filename)
  return enqueue(path, async () => {
    try {
      await fs.promises.rm(path, { recursive: true })
      unreadable.delete(pathKey(path))
    } catch (error) {
      throw new FileServiceError('[deleteFile] Cannot delete ' + path, error)
    }
  })
}

/** Await writes already queued by stores before the process exits. */
export const flushFileOperations = async (): Promise<void> => {
  while (pending.size > 0) await Promise.all(pending.values())
}
