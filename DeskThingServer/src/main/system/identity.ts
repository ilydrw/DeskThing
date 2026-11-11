/**
 * Identity of this independent distribution.
 *
 * DeskThing Community installs beside the original DeskThing rather than over
 * it: it has its own application ID and its own profile directory, and imports
 * the original's data once (see services/initialize/legacyImport.ts).
 *
 * This module must stay free of imports so it can be loaded before anything else.
 */

/** Must match `build.appId` in package.json. */
export const APP_ID = 'io.github.ilydrw.deskthing-community'

/** Must match `build.productName` in package.json. */
export const PRODUCT_NAME = 'DeskThing Community'

/** Directory name of this distribution's profile inside the OS app-data folder. */
export const PROFILE_DIRECTORY = 'deskthing-community'

/**
 * Profile directory names used by the original DeskThing. Both spellings are
 * listed because the name is case-sensitive outside Windows and macOS.
 */
export const LEGACY_PROFILE_DIRECTORIES = ['deskthing', 'DeskThing'] as const
