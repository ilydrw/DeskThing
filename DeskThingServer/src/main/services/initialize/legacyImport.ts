/**
 * One-time import of an original DeskThing profile into this distribution's profile.
 *
 * The import only ever reads the original profile. Entries are copied into a
 * staging directory first and moved into place once every copy has succeeded,
 * so a failed import leaves both profiles as they were.
 */
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

export const LEGACY_IMPORT_MARKER = 'legacy-import.json'
export const LEGACY_IMPORT_SCHEMA_VERSION = 1
const STAGING_DIRECTORY = '.legacy-import-staging'

/**
 * The entries that make up a user's DeskThing data. Browser caches, logs, and
 * downloaded firmware are deliberately excluded: they are rebuilt or fetched again.
 */
export const PROFILE_DATA_ENTRIES = [
  'settings.json',
  'apps.json',
  'machine-id.json',
  'apps',
  'data',
  'devices',
  'mappings',
  'profiles',
  'system',
  'webapp'
] as const

export type LegacyImportRecord = {
  schemaVersion: number
  status: 'imported' | 'skipped'
  /** Why the import did not run. Only present when `status` is `skipped`. */
  reason?: 'existing-profile'
  recordedAt: string
  sourcePath?: string
  sourceVersion?: string
  entries?: string[]
}

export type LegacyImportResult =
  | { status: 'imported'; record: LegacyImportRecord }
  | { status: 'skipped'; reason: 'already-recorded' | 'existing-profile' | 'no-legacy-profile' }

export type LegacyImportOptions = {
  /** This distribution's profile directory. */
  targetDir: string
  /** Candidate original profile directories, in order of preference. */
  legacyDirs: string[]
  now?: () => Date
  onProgress?: (message: string) => void | Promise<void>
}

const exists = async (path: string): Promise<boolean> => {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

const readVersion = async (profileDir: string): Promise<string | undefined> => {
  try {
    const settings = JSON.parse(await readFile(join(profileDir, 'settings.json'), 'utf8'))
    return typeof settings?.version === 'string' ? settings.version : undefined
  } catch {
    return undefined
  }
}

const writeMarker = async (targetDir: string, record: LegacyImportRecord): Promise<void> => {
  const markerPath = join(targetDir, LEGACY_IMPORT_MARKER)
  const temporaryPath = `${markerPath}.tmp`
  await mkdir(targetDir, { recursive: true })
  await writeFile(temporaryPath, JSON.stringify(record, null, 2), 'utf8')
  await rename(temporaryPath, markerPath)
}

const findLegacyProfile = async (
  targetDir: string,
  legacyDirs: string[]
): Promise<string | undefined> => {
  const target = resolve(targetDir).toLowerCase()
  for (const candidate of legacyDirs) {
    // Never treat this distribution's own profile as the original.
    if (resolve(candidate).toLowerCase() === target) continue
    if (await exists(join(candidate, 'settings.json'))) return candidate
  }
  return undefined
}

export const importLegacyProfile = async ({
  targetDir,
  legacyDirs,
  now = () => new Date(),
  onProgress
}: LegacyImportOptions): Promise<LegacyImportResult> => {
  if (await exists(join(targetDir, LEGACY_IMPORT_MARKER))) {
    return { status: 'skipped', reason: 'already-recorded' }
  }

  // Data already in this profile always wins; never merge into or replace it.
  for (const entry of PROFILE_DATA_ENTRIES) {
    if (await exists(join(targetDir, entry))) {
      await writeMarker(targetDir, {
        schemaVersion: LEGACY_IMPORT_SCHEMA_VERSION,
        status: 'skipped',
        reason: 'existing-profile',
        recordedAt: now().toISOString()
      })
      return { status: 'skipped', reason: 'existing-profile' }
    }
  }

  const sourceDir = await findLegacyProfile(targetDir, legacyDirs)
  // No marker here: a later launch may still find an original profile to import,
  // as long as this profile has not been used in the meantime.
  if (!sourceDir) return { status: 'skipped', reason: 'no-legacy-profile' }

  await onProgress?.('Importing your existing DeskThing data...')

  const stagingDir = join(targetDir, STAGING_DIRECTORY)
  const moved: string[] = []
  try {
    await rm(stagingDir, { recursive: true, force: true })
    await mkdir(stagingDir, { recursive: true })

    const copied: string[] = []
    for (const entry of PROFILE_DATA_ENTRIES) {
      const source = join(sourceDir, entry)
      if (!(await exists(source))) continue
      await cp(source, join(stagingDir, entry), { recursive: true, errorOnExist: true })
      copied.push(entry)
    }

    for (const entry of copied) {
      await rename(join(stagingDir, entry), join(targetDir, entry))
      moved.push(entry)
    }

    const record: LegacyImportRecord = {
      schemaVersion: LEGACY_IMPORT_SCHEMA_VERSION,
      status: 'imported',
      recordedAt: now().toISOString(),
      sourcePath: sourceDir,
      sourceVersion: await readVersion(sourceDir),
      entries: copied
    }
    await writeMarker(targetDir, record)
    return { status: 'imported', record }
  } catch (error) {
    // Undo a partial import so the next launch starts from a clean profile.
    await Promise.allSettled(
      moved.map((entry) => rm(join(targetDir, entry), { recursive: true, force: true }))
    )
    throw error
  } finally {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined)
  }
}
