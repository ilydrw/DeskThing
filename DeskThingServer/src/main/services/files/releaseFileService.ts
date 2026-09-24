import {
  AppReleaseFile,
  AppReleaseFile01111,
  ClientReleaseFile,
  ClientReleaseFile01111
} from '@shared/types'
import { readFromFile, writeToFile } from './fileService'
import { join } from 'node:path'
import logger from '@server/utils/logger'
import { assertReleaseFileMigration } from '../releases/migrationUtils'
import { isRecord } from '@shared/validation/settings'

const validateReleaseFile = (value: unknown): void => {
  if (!isRecord(value) || !['0.11.11', '0.11.8', '0.10.0'].includes(String(value.version)) ||
      !Array.isArray(value.repositories) || !value.repositories.every((repo) => typeof repo === 'string') ||
      !Array.isArray(value.releases) || !value.releases.every(isRecord) ||
      typeof value.timestamp !== 'number' || !Number.isFinite(value.timestamp)) {
    throw new Error('Invalid or unsupported release file')
  }
  if (value.version !== '0.10.0') {
    if (!['app', 'client'].includes(String(value.type)) || value.releases.some((release) =>
      typeof release.id !== 'string' || !isRecord(release.mainRelease) ||
      !isRecord(release.mainRelease[value.type === 'app' ? 'appManifest' : 'clientManifest']) ||
      !Array.isArray(release.pastReleases))) throw new Error('Invalid cached release')
  } else if ('references' in value && !Array.isArray(value.references)) {
    throw new Error('Invalid legacy release references')
  }
}

export const saveAppReleaseData = async (appReleaseFile: AppReleaseFile): Promise<void> => {
  try {
    const appReleasePath = join('system', 'appReleases.json')
    await writeToFile(appReleaseFile, appReleasePath)
  } catch (error) {
    logger.error(`Failed to save app release files`, {
      error: error as Error,
      function: 'saveAppReleaseFile',
      source: 'releaseFileService'
    })
    throw new Error(`Failed to save app release data`, { cause: error })
  }
}

export const saveClientReleaseData = async (
  clientReleaseFile: ClientReleaseFile
): Promise<void> => {
  try {
    const clientReleasePath = join('system', 'clientReleases.json')
    await writeToFile(clientReleaseFile, clientReleasePath)
  } catch (error) {
    logger.error(`Failed to save client release files`, {
      error: error as Error,
      function: 'saveClientReleaseFile',
      source: 'releaseFileService'
    })
    throw new Error(`Failed to save client release data`, { cause: error })
  }
}

export const readAppReleaseData = async (): Promise<AppReleaseFile01111 | undefined> => {
  try {
    const appReleasePath = join('system', 'appReleases.json')

    const appReleaseFile = await readFromFile<AppReleaseFile>(appReleasePath, validateReleaseFile)

    if (!appReleaseFile) return undefined

    return assertReleaseFileMigration(appReleaseFile)
  } catch (error) {
    logger.error(`Failed to read app release files`, {
      error: error as Error,
      function: 'readAppReleaseData',
      source: 'releaseFileService'
    })
    throw new Error(`Failed to read app release data`, { cause: error })
  }
}

export const readClientReleaseData = async (): Promise<ClientReleaseFile01111 | undefined> => {
  try {
    const clientReleasePath = join('system', 'clientReleases.json')

    const clientReleaseFile = await readFromFile<ClientReleaseFile>(clientReleasePath, validateReleaseFile)

    if (!clientReleaseFile) return undefined

    return assertReleaseFileMigration(clientReleaseFile)
  } catch (error) {
    logger.error(`Failed to read client release files`, {
      error: error as Error,
      function: 'readClientReleaseData',
      source: 'releaseFileService'
    })
    throw new Error(`Failed to read client release data`, { cause: error })
  }
}
