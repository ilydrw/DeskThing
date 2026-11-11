/**
 * Holds the migration logic required to migrate the deskthing file system to the current structure
 */
import { updateLoadingStatus } from '@server/windows/loadingWindow'
import { AppData } from '@shared/types'
import { app } from 'electron'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import semverSatisfies from 'semver/functions/satisfies.js'
import { verifyAppInstanceStructure } from '../apps/appValidator'
import { PROFILE_DATA_ENTRIES } from './legacyImport'

export const migrateDeskThing = async (prevVersion: string | undefined): Promise<void> => {
  const currentVersion = app.getVersion()
  if (prevVersion == currentVersion) return // the apps are the same version - early break

  try {
    if (!prevVersion) {
      // No readable version: start clean, but keep the old data recoverable
      await setAsideUnversionedData()
    } else if (semverSatisfies(prevVersion, '<0.11.0')) {
      // migrate from before v0.11.0
      await preEleven()
    } else {
      // Become more specific for v0.11.0 to v0.11.X migration Headers
      await elevenComp(prevVersion)
    }
  } catch (error) {
    console.error(`An error was encountered while initializing. This may be expected: `, error)
  }
}

/**
 * Moves data of an unknown version out of the way instead of deleting it.
 *
 * A missing or unreadable settings.json used to wipe the whole profile, which
 * destroyed installed apps and mappings whenever that one file was damaged.
 * The data is now kept under recovery/ so it can be restored by hand.
 */
export const setAsideUnversionedData = async (now: Date = new Date()): Promise<void> => {
  const profilePath = app.getPath('userData')
  const present: string[] = []
  for (const entry of PROFILE_DATA_ENTRIES) {
    try {
      await stat(join(profilePath, entry))
      present.push(entry)
    } catch {
      // not present
    }
  }
  if (present.length === 0) return // fresh install

  updateLoadingStatus('Setting aside data from an unknown version...')
  const recoveryPath = join(
    profilePath,
    'recovery',
    `unversioned-${now.toISOString().replace(/[:.]/g, '-')}`
  )
  await mkdir(recoveryPath, { recursive: true })
  for (const entry of present) {
    try {
      await rename(join(profilePath, entry), join(recoveryPath, entry))
    } catch (error) {
      console.error(`Could not set aside ${entry}`, error)
    }
  }
}

/**
 * Deletes specific files and attempts to migrate apps
 */
const preEleven = async (): Promise<void> => {
  updateLoadingStatus('Deleting junk data...')
  // TODO: Implement migration logic for version <0.11.0
  const oldFiles = [
    'application.log.json', // replaced by /logs folder
    'application.log', // replaced by /logs folder
    'readable.log', // replaces by /logs folder
    'data.json', // replaced by file-specific files
    'mappings.json', // replaced by /mappings folder
    'tasks.json', // replaced by each app having its own in data/
    'thumbnails' // all cached images - it's good to clear out as it will be remade
  ]

  // Run all deletions in parallel - even if some fail, that doesn't matter
  await Promise.allSettled(oldFiles.map(deleteFile))

  updateLoadingStatus('Disabling and Deleting Apps...')

  await disableApps()
}

/**
 * Disables all of the apps so they don't run automatically (and dont create settings/configs that may interfere with updating)
 */
const disableApps = async (): Promise<void> => {
  const APP_PATH = join(app.getPath('userData'), 'apps.json')

  try {
    const apps = JSON.parse(await readFile(APP_PATH, 'utf8')) as AppData
    verifyAppInstanceStructure(apps)

    const appNames = Object.keys(apps)

    updateLoadingStatus('Disabling apps...')
    appNames.forEach((appName) => {
      apps[appName].enabled = false
      apps[appName].running = false
    })

    updateLoadingStatus('Re-saving app data...')

    await writeFile(APP_PATH, JSON.stringify(apps))
  } catch (error) {
    console.warn('Failed while verifying apps.json', error)
  }
}

const elevenComp = async (prevVersion): Promise<void> => {
  switch (prevVersion) {
    case semverSatisfies(prevVersion, '<=0.11.0'): // handles migration from sub-0.11
      await preEleven()
      break
    default:
      // no further migration steps needed
      break
  }
}

/**
 * Utility Functions
 */

const deleteFile = async (file: string): Promise<void> => {
  try {
    const path = join(app.getPath('userData'), file)
    await rm(path, { recursive: true, force: true })
  } catch (error) {
    console.error(`Error deleting file ${file}:`, error)
  }
}
