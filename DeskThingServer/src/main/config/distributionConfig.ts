const urlKeys = [
  'DESKTHING_APP_CATALOG_REPOSITORY',
  'DESKTHING_CLIENT_CATALOG_REPOSITORY',
  'DESKTHING_FIRMWARE_API_URL',
  'DESKTHING_RECOMMENDED_FIRMWARE_URL',
  'DESKTHING_DRIVER_INSTALLER_URL',
  'DESKTHING_UPDATE_FEED_URL'
] as const

const valueKeys = [
  'DESKTHING_FIRMWARE_PRODUCT_ID',
  'DESKTHING_RECOMMENDED_FIRMWARE_VERSION_ID',
  'DESKTHING_RECOMMENDED_FIRMWARE_FILE_ID',
  'DESKTHING_DRIVER_INSTALLER_SHA256'
] as const

type DistributionKey = (typeof urlKeys)[number] | (typeof valueKeys)[number]
export type DistributionConfig = Partial<Record<DistributionKey, string>>

const allowedKeys = new Set<string>([...urlKeys, ...valueKeys])

// Only public distribution settings belong in the binary. Credentials, telemetry,
// and local network permissions must remain operator/user controlled.
export const parseDistributionConfig = (input: unknown): DistributionConfig => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('distribution.json must contain a JSON object')
  }

  const config: DistributionConfig = {}
  const values: Record<string, string> = {}
  for (const [key, value] of Object.entries(input)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unsupported distribution setting: ${key}`)
    }
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(
        `Distribution setting ${key} must be a nonempty string; omit it to disable it`
      )
    }
    values[key] = value.trim()
  }

  for (const key of urlKeys) {
    if (!(key in values)) continue
    const value = values[key]
    let url: URL
    try {
      url = new URL(value)
    } catch {
      throw new Error(`Distribution setting ${key} must be a valid HTTPS URL`)
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      throw new Error(
        `Distribution setting ${key} must be HTTPS without credentials, query, or fragment`
      )
    }
    if (
      key.endsWith('_CATALOG_REPOSITORY') &&
      (url.hostname !== 'github.com' || url.port || !/^\/[\w.-]+\/[\w.-]+\/?$/.test(url.pathname))
    ) {
      throw new Error(`Distribution setting ${key} must identify a GitHub owner/repository`)
    }
    config[key] = url.toString().replace(/\/$/, '')
  }

  for (const key of valueKeys) {
    if (key in values) config[key] = values[key]
  }
  const digest = config.DESKTHING_DRIVER_INSTALLER_SHA256
  if (digest && !/^[a-fA-F0-9]{64}$/.test(digest)) {
    throw new Error('Distribution driver installer SHA-256 must contain 64 hexadecimal characters')
  }
  if (Boolean(config.DESKTHING_DRIVER_INSTALLER_URL) !== Boolean(digest)) {
    throw new Error('Distribution driver installer URL and SHA-256 must be configured together')
  }
  if (digest) config.DESKTHING_DRIVER_INSTALLER_SHA256 = digest.toLowerCase()
  return config
}

export const readServiceValue = (
  name: string,
  defaults: DistributionConfig,
  environment: NodeJS.ProcessEnv = process.env
): string | undefined => {
  // An explicit empty override disables a bundled default instead of restoring it.
  if (Object.prototype.hasOwnProperty.call(environment, name) && environment[name] !== undefined) {
    return environment[name]
  }
  if (!Object.prototype.hasOwnProperty.call(defaults, name)) return undefined
  return defaults[name as DistributionKey]
}
