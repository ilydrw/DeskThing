import { updateLoadingStatus } from '@server/windows/loadingWindow'
import { Settings } from '@shared/types'
import { readFromFile } from '@server/services/files/fileService'
import { assertRecord } from '@shared/validation/settings'

export const checkFlag = async (flagKey: keyof Settings): Promise<boolean> => {
  await updateLoadingStatus(`Checking flag: ${flagKey}`)
  try {
    const settings = await readFromFile<Settings>('settings.json', assertRecord)
    return settings?.[flagKey] === true
  } catch (error) {
    await updateLoadingStatus('Unable to read startup preference; using default', error)
    return false
  }
}
