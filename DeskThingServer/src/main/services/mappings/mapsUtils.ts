import { getAppFilePath } from '../apps/appUtils'
import path from 'node:path'
import { app } from 'electron'
import { readFile } from 'node:fs/promises'
import { Action } from '@deskthing/types'
import logger from '@server/utils/logger'
import { resolvePathWithinRoot } from '@server/utils/pathSecurity'

export const FetchIcon = async (action: Action): Promise<string | null> => {
  if (!action) return null

  if (!action.source) {
    logger.warn('Unable to fetch icon for action: source is not defined', {
      source: 'FetchIcon'
    })
    return null
  }

  try {
    const iconRoot =
      action.source === 'server'
        ? path.join(app.getPath('userData'), 'webapp', 'icons')
        : getAppFilePath(action.source, 'icons')
    const iconPath = resolvePathWithinRoot(iconRoot, `${action.icon || action.id}.svg`)
    if (!iconPath) {
      logger.warn('Rejected an action icon path outside its icon directory', {
        source: 'FetchIcon'
      })
      return null
    }

    return await readFile(iconPath, 'utf8')
  } catch (error) {
    logger.info('Error reading icon file', { error: error as Error })
    return null
  }
}
