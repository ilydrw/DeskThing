/**
 * the initialization process. This is meant to be as fast as possible and run while the app is starting up before any core functions run
 *
 * Things like clearing/creating file systems and initial system check
 */
import { updateLoadingStatus } from '@server/windows/loadingWindow'
import { getCurrentVersion } from './getVersion'
import { migrateDeskThing } from './migrateDeskThing'
import { importLegacyProfile } from './legacyImport'
import { LEGACY_PROFILE_DIRECTORIES } from '@server/system/identity'
import { app } from 'electron'
import { join } from 'node:path'

/**
 * Brings an original DeskThing profile into this distribution's profile on first
 * launch. A failure must not block startup, and it never touches the original.
 */
const importExistingData = async (): Promise<void> => {
  try {
    const appData = app.getPath('appData')
    const result = await importLegacyProfile({
      targetDir: app.getPath('userData'),
      legacyDirs: LEGACY_PROFILE_DIRECTORIES.map((name) => join(appData, name)),
      onProgress: (message) => updateLoadingStatus(message)
    })
    if (result.status === 'imported') {
      console.log(
        `Imported DeskThing data from ${result.record.sourcePath}:`,
        result.record.entries?.join(', ')
      )
    }
  } catch (error) {
    console.error('Could not import the existing DeskThing data. Starting without it.', error)
    await updateLoadingStatus('Could not import existing DeskThing data')
  }
}

export const initializationCheck = async (): Promise<void> => {
  // Check the current version (if it exists)
  await importExistingData()

  try {
    const currentVersion = await getCurrentVersion()

    // Migrate the fs to the current version
    await migrateDeskThing(currentVersion)

    await updateLoadingStatus('Finalizing...')
  } catch (error) {
    console.error('An error was found while initializing - skipping', error)
  }
}
