import 'dotenv/config'
import { notarize } from '@electron/notarize'

export default async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') {
    console.log('Skipping notarization: Not macOS platform')
    return
  }

  // Unsigned validation builds opt out explicitly; release builds fail closed.
  if (process.env.DESKTHING_SKIP_NOTARIZATION === 'true') {
    console.log('Skipping notarization: unsigned validation build')
    return
  }

  for (const name of ['APPLE_TEAM_ID', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD']) {
    if (!process.env[name]?.trim()) {
      throw new Error(
        `Notarization requires ${name}. Only unsigned validation builds may set DESKTHING_SKIP_NOTARIZATION=true.`
      )
    }
  }

  const appName = context.packager.appInfo.productFilename

  console.log('Starting notarization process...')

  try {
    await notarize({
      tool: 'notarytool',
      teamId: process.env.APPLE_TEAM_ID,
      appPath: `${appOutDir}/${appName}.app`,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD
    })

    console.log('Notarization completed successfully')
  } catch (error) {
    throw new Error(`Notarization failed for ${appName}; packaging aborted.`, { cause: error })
  }
}
