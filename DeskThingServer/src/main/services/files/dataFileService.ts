import { AppDataInterface } from '@deskthing/types'
import { deleteFile, readFromFile, updateFile, writeToFile } from './fileService'
import { join } from 'node:path'
import { isValidAppDataInterface } from '../apps/appValidator'
import { assertSafePathSegment } from '@server/utils/pathSecurity'

const dataPath = (name: string): string => {
  assertSafePathSegment(name, 'App identifier')
  return join('data', name + '.json')
}

export const overwriteData = async (name: string, data: AppDataInterface): Promise<void> => {
  isValidAppDataInterface(data)
  await writeToFile(data, dataPath(name))
}

export const setData = async (
  appName: string,
  value: Partial<AppDataInterface>
): Promise<AppDataInterface | undefined> => {
  const snapshot = structuredClone(value)
  return updateFile<AppDataInterface>(dataPath(appName), (current) => {
    const version = snapshot.version ?? current?.version
    if (!version) throw new Error('Cannot save app data without a version for ' + appName)
    return {
      ...current,
      ...snapshot,
      version,
      data: { ...current?.data, ...snapshot.data },
      settings: { ...current?.settings, ...snapshot.settings },
      tasks: { ...current?.tasks, ...snapshot.tasks },
      actions: { ...current?.actions, ...snapshot.actions },
      keys: { ...current?.keys, ...snapshot.keys }
    }
  }, isValidAppDataInterface)
}

export const getData = async (appName: string): Promise<AppDataInterface | undefined> =>
  readFromFile<AppDataInterface>(dataPath(appName), isValidAppDataInterface)

export const purgeAppData = async (appName: string): Promise<void> => {
  await deleteFile(dataPath(appName))
}
