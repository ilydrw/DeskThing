import logger from '@server/utils/logger'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { progressBus } from '../events/progressBus'
import { ProgressChannel } from '@shared/types'
import { ClientManifest } from '@deskthing/types'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { handleError } from '@server/utils/errorHandler'

const isClientManifest = (value: unknown): value is ClientManifest => {
  if (!value || typeof value !== 'object') return false

  const manifest = value as Partial<ClientManifest>
  return (
    typeof manifest.id === 'string' &&
    manifest.id.length > 0 &&
    typeof manifest.name === 'string' &&
    manifest.name.length > 0 &&
    typeof manifest.version === 'string' &&
    manifest.version.length > 0
  )
}

const parseClientManifest = (content: string): ClientManifest | null => {
  const parsed = JSON.parse(content) as unknown
  return isClientManifest(parsed) ? parsed : null
}

const parseClientManifestScript = (content: string): ClientManifest | null => {
  const match = content.match(/window\.manifest\s*=\s*({[\s\S]*?})\s*;\s*document\.dispatchEvent/)
  return match ? parseClientManifest(match[1]) : null
}

const writeManifestAtomically = async (
  manifestPath: string,
  manifest: ClientManifest
): Promise<void> => {
  const tempPath = join(dirname(manifestPath), `.manifest-${process.pid}-${randomUUID()}.tmp`)

  try {
    await writeFile(tempPath, JSON.stringify(manifest), 'utf8')
    await rename(tempPath, manifestPath)
  } finally {
    await rm(tempPath, { force: true }).catch(() => undefined)
  }
}

const recoverClientManifest = async (
  webappPath: string,
  manifestPath: string
): Promise<ClientManifest | null> => {
  const recoverySources = [
    {
      name: 'manifest.js',
      parse: parseClientManifestScript
    },
    {
      name: 'manifest.default.json',
      parse: parseClientManifest
    }
  ]

  for (const source of recoverySources) {
    try {
      const recovered = source.parse(await readFile(join(webappPath, source.name), 'utf8'))
      if (!recovered) continue

      await writeManifestAtomically(manifestPath, recovered)
      logger.warn(`Recovered the installed client manifest from ${source.name}`, {
        store: 'clientService',
        method: 'getClientManifest'
      })
      return recovered
    } catch {
      // Try the next packaged recovery source.
    }
  }

  return null
}

let manifestUpdateQueue: Promise<void> = Promise.resolve()

/**
 * Downloads and installs a client from a given URL.
 * @channel - {@link ProgressChannel.FN_CLIENT_INSTALL}
 * @param url - The URL of the client to download.
 */
export async function downloadAndInstallClient(url: string): Promise<void> {
  progressBus.start(
    ProgressChannel.FN_CLIENT_INSTALL,
    'Download-Client',
    'Initializing download...'
  )
  const userDataPath = app.getPath('userData')
  const extractDir = join(userDataPath, 'webapp')

  if (!existsSync(extractDir)) {
    mkdirSync(extractDir, { recursive: true })
  }

  const AdmZip = await import('adm-zip')

  try {
    progressBus.update(ProgressChannel.FN_CLIENT_INSTALL, 'Fetching...', 5)
    const response = await fetch(url)

    if (!response.ok) {
      const errorMessage = `Failed to download client: ${response.status}`
      logger.error(errorMessage)
      progressBus.warn(
        ProgressChannel.FN_CLIENT_INSTALL,
        'Download-Client',
        'Download failed',
        errorMessage
      )
      throw new Error(errorMessage)
    }

    const chunks: Uint8Array[] = []
    const contentLength = Number(response.headers.get('content-length'))
    let receivedLength = 0
    let prevPercentage = 0
    const reader = response.body?.getReader()

    if (!reader) {
      throw new Error('Failed to get reader from response body')
    }

    let done = false
    while (!done) {
      const result = await reader.read()
      done = result.done
      if (!done && result.value) {
        chunks.push(result.value)
        receivedLength += result.value.length
        const progress = Math.round((receivedLength / contentLength) * 100)
        if (progress > prevPercentage) {
          prevPercentage = progress
          progressBus.update(
            ProgressChannel.FN_CLIENT_INSTALL,
            `Downloading... ${progress}%`,
            progress * 0.8 + 5
          )
        }
      }
    }

    progressBus.update(ProgressChannel.FN_CLIENT_INSTALL, 'Saving...', 90)
    const buffer = Buffer.concat(chunks)
    const tempZipPath = join(extractDir, 'temp.zip')
    writeFileSync(tempZipPath, buffer)

    progressBus.update(ProgressChannel.FN_CLIENT_INSTALL, 'Extracting files...', 95)
    const zip = new AdmZip.default(tempZipPath)
    zip.extractAllTo(extractDir, true)
    unlinkSync(tempZipPath)

    progressBus.complete(
      ProgressChannel.FN_CLIENT_INSTALL,
      'Download-Client',
      'Client installation complete!'
    )
  } catch (error) {
    logger.error('Error downloading and installing client:', {
      error: error as Error
    })
    progressBus.error(
      ProgressChannel.FN_CLIENT_INSTALL,
      'Download-Client',
      'Installation failed',
      (error as Error).message
    )
    throw error
  }
}

/**
 * Gets the manifest of the client.
 * @returns The manifest of the client.
 */
export const getClientManifest = async (): Promise<ClientManifest | null> => {
  const userDataPath = app.getPath('userData')
  const webappPath = join(userDataPath, 'webapp')
  const manifestPath = join(webappPath, 'manifest.json')

  try {
    const data = await readFile(manifestPath, 'utf8')
    const manifest = parseClientManifest(data)
    if (!manifest) {
      throw new Error('Installed client manifest is missing required fields')
    }
    return manifest
  } catch (error) {
    const recoveredManifest = await recoverClientManifest(webappPath, manifestPath)
    if (recoveredManifest) return recoveredManifest

    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      logger.debug('No device client is installed', {
        store: 'clientService',
        method: 'getClientManifest'
      })
    } else {
      logger.warn('Unable to read the installed client manifest', {
        error: error as Error,
        store: 'clientService',
        method: 'getClientManifest'
      })
    }
    return null
  }
}
export const updateManifest = async (manifest: Partial<ClientManifest>): Promise<void> => {
  const userDataPath = app.getPath('userData')
  const manifestPath = join(userDataPath, 'webapp', 'manifest.json')

  const update = manifestUpdateQueue.then(async () => {
    const parsedManifest = await getClientManifest()
    if (!parsedManifest) {
      throw new Error('Cannot update the client manifest because no valid client is installed')
    }

    const updatedManifest = { ...parsedManifest, ...manifest }
    await writeManifestAtomically(manifestPath, updatedManifest)
  })

  manifestUpdateQueue = update.catch(() => undefined)

  try {
    await update
  } catch (error) {
    logger.error('Error updating client manifest:', {
      error: error as Error
    })
    throw error
  }
}

export const setManifestJS = async (manifest: Partial<ClientManifest>): Promise<void> => {
  const userDataPath = app.getPath('userData')
  const scriptPath = join(userDataPath, 'webapp', 'manifest.js')
  try {
    const existingManifest = await getClientManifest()
    const updatedManifest = { ...existingManifest, ...manifest }

    const fileContent = `window.manifest = ${JSON.stringify(updatedManifest, null, 2)};
document.dispatchEvent(new Event('manifestLoaded'))`

    await writeFile(scriptPath, fileContent, 'utf8')
  } catch (error) {
    logger.error('Error updating client manifest:', {
      error: error as Error
    })
  }
}

/**
 * Loads a client from a zip file.
 * @channel - {@link ProgressChannel.FN_CLIENT_INSTALL}
 * @param zipPath - The path to the zip file.
 */
export async function loadClientFromZip(zipPath: string): Promise<ClientManifest> {
  progressBus.start(ProgressChannel.FN_CLIENT_INSTALL, 'Load-Client', 'Loading client from zip...')
  const userDataPath = app.getPath('userData')
  const extractDir = join(userDataPath, 'webapp')

  if (!existsSync(extractDir)) {
    mkdirSync(extractDir, { recursive: true })
  }

  const AdmZip = await import('adm-zip')

  try {
    progressBus.update(ProgressChannel.FN_CLIENT_INSTALL, 'Extracting files...', 50)
    const zip = new AdmZip.default(zipPath)
    zip.extractAllTo(extractDir, true)
    progressBus.complete(
      ProgressChannel.FN_CLIENT_INSTALL,
      'Load-Client',
      'Client loaded successfully!'
    )

    const manifest = await getClientManifest()

    if (!manifest) {
      throw new Error('Client manifest not found after extraction')
    }

    return manifest
  } catch (error) {
    progressBus.error(
      ProgressChannel.FN_CLIENT_INSTALL,
      'Load-Client',
      'Loading failed',
      error instanceof Error ? error.message : handleError(error)
    )
    throw error
  }
}
