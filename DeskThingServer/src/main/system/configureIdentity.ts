/**
 * Points Electron at this distribution's own profile directory.
 *
 * Import this before any other application module: the single-instance lock,
 * the logger, and every store resolve `userData` when they load.
 */
import { app } from 'electron'
import { join } from 'node:path'
import { PRODUCT_NAME, PROFILE_DIRECTORY } from './identity'

app.setName(PRODUCT_NAME)
app.setPath('userData', join(app.getPath('appData'), PROFILE_DIRECTORY))
