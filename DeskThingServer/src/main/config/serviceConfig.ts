import distributionDefaults from '../../../distribution.json'
import { parseDistributionConfig, readServiceValue } from './distributionConfig'

const distributionConfig = parseDistributionConfig(distributionDefaults)

export interface ServiceConfig {
  statsUrl: string | null
  feedbackUrl: string | null
  supporterToken: string | null
  appCatalogRepository: string | null
  clientCatalogRepository: string | null
  firmwareApiUrl: string | null
  firmwareProductId: string | null
  recommendedFirmwareVersionId: string | null
  recommendedFirmwareFileId: string | null
  recommendedFirmwareUrl: string | null
  driverInstallerUrl: string | null
  driverInstallerSha256: string | null
  updateFeedUrl: string | null
  proxyAllowPrivateNetwork: boolean
}

const readOptionalHttpUrl = (name: string): string | null => {
  const value = readServiceValue(name, distributionConfig)?.trim()
  if (!value) return null

  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

const readOptionalValue = (name: string): string | null => {
  const value = readServiceValue(name, distributionConfig)?.trim()
  return value || null
}

const readOptionalSha256 = (name: string): string | null => {
  const value = readOptionalValue(name)?.toLowerCase()
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null
}

const readOptionalBoolean = (name: string): boolean => {
  const value = readOptionalValue(name)?.toLowerCase()
  return value === '1' || value === 'true' || value === 'yes'
}

export const getServiceConfig = (): ServiceConfig => ({
  statsUrl: readOptionalHttpUrl('DESKTHING_STATS_URL'),
  feedbackUrl: readOptionalHttpUrl('DESKTHING_FEEDBACK_URL'),
  supporterToken: readOptionalValue('DESKTHING_SUPPORTER_TOKEN'),
  appCatalogRepository: readOptionalHttpUrl('DESKTHING_APP_CATALOG_REPOSITORY'),
  clientCatalogRepository: readOptionalHttpUrl('DESKTHING_CLIENT_CATALOG_REPOSITORY'),
  firmwareApiUrl: readOptionalHttpUrl('DESKTHING_FIRMWARE_API_URL'),
  firmwareProductId: readOptionalValue('DESKTHING_FIRMWARE_PRODUCT_ID'),
  recommendedFirmwareVersionId: readOptionalValue('DESKTHING_RECOMMENDED_FIRMWARE_VERSION_ID'),
  recommendedFirmwareFileId: readOptionalValue('DESKTHING_RECOMMENDED_FIRMWARE_FILE_ID'),
  recommendedFirmwareUrl: readOptionalHttpUrl('DESKTHING_RECOMMENDED_FIRMWARE_URL'),
  driverInstallerUrl: readOptionalHttpUrl('DESKTHING_DRIVER_INSTALLER_URL'),
  driverInstallerSha256: readOptionalSha256('DESKTHING_DRIVER_INSTALLER_SHA256'),
  updateFeedUrl: readOptionalHttpUrl('DESKTHING_UPDATE_FEED_URL'),
  proxyAllowPrivateNetwork: readOptionalBoolean('DESKTHING_PROXY_ALLOW_PRIVATE_NETWORK')
})
