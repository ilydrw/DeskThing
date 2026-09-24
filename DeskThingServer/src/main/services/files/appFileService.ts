import { App, AppManifest } from '@deskthing/types'
import Logger from '@server/utils/logger'
import { AppData } from '@shared/types'
import { deleteFile, readFromFile, updateFile, writeToFile } from './fileService'
import { verifyAppInstanceStructure, sanitizeAppStructure } from '../apps/appValidator'
import { join } from 'node:path'
import { assertSafePathSegment } from '@server/utils/pathSecurity'

const APP_FILE = 'apps.json'

export const getAppData = async (): Promise<AppData> =>
  (await readFromFile<AppData>(APP_FILE, verifyAppInstanceStructure)) ?? {}

export const setAppData = async (newApp: Partial<App>): Promise<void> => {
  if (!newApp.name) throw new Error('Cannot save app without a name')
  const appName = newApp.name
  assertSafePathSegment(appName, 'App identifier')
  const snapshot = structuredClone(newApp)
  await updateFile<AppData>(APP_FILE, (current) => {
    const data = current ?? {}
    const updated = { ...data[appName], ...snapshot }
    sanitizeAppStructure(updated)
    return { ...data, [appName]: updated }
  }, verifyAppInstanceStructure)
}

export const setAppsData = async (appsList: App[]): Promise<void> => {
  const data = Object.fromEntries(appsList.map((app) => [app.name, app]))
  verifyAppInstanceStructure(data)
  await writeToFile(data, APP_FILE)
}

export const addAppManifest = async (manifest: AppManifest, appName: string): Promise<void> => {
  assertSafePathSegment(appName, 'App identifier')
  const snapshot = structuredClone(manifest)
  await updateFile<AppData>(APP_FILE, (data) => {
    if (!data?.[appName]) throw new Error('Cannot update manifest for missing app ' + appName)
    return { ...data, [appName]: { ...data[appName], manifest: snapshot } }
  }, verifyAppInstanceStructure)
}

export const getAppByName = async (appName: string): Promise<App | undefined> => {
  assertSafePathSegment(appName, 'App identifier')
  return (await getAppData())[appName]
}

export const deleteAppPath = async (appName: string): Promise<boolean> => {
  try {
    assertSafePathSegment(appName, 'App identifier')
    await deleteFile(join('apps', appName))
    return true
  } catch (error) {
    Logger.error('Failed to remove app directory ' + appName, {
      source: 'AppFileService', function: 'deleteAppPath', error: error as Error
    })
    return false
  }
}

export const purgeAppConfig = async (appName: string): Promise<void> => {
  assertSafePathSegment(appName, 'App identifier')
  await updateFile<AppData>(APP_FILE, (data) => {
    if (!data?.[appName]) throw new Error('App not found: ' + appName)
    delete data[appName]
    return data
  }, verifyAppInstanceStructure)
}
