import { ProgressEvent } from './progress'

/**
 * What is emitted during a firmware download
 */
export type ThingifyArchiveDownloadEvent = ProgressEvent

/**
 */
export type ThingifyArchiveDownloadResult = {
  /**
   * Success or failure
   */
  status: boolean
  statusText: string
  operationText: string
}

/**
 * A Thingify-compatible `/firmware` response
 */
export type ThingifyApiFirmware = {
  id: string
  name: string
  description: string
  image: string
  createdAt: number | null
  updatedAt: number | null
  /**
   * Firmware catalog identifier
   *
   * The total number of downloads
   */
  totalDownloads?: number
  /**
   * Firmware catalog version entries
   *
   * The array of versions
   */
  versions?: ThingifyApiFirmwareVersion[]
}

/**
 * A Thingify-compatible firmware version response
 *
 * Inside {@link ThingifyApiFirmware.versions}
 */
export type ThingifyApiFirmwareVersion = {
  id: string
  version: string
  changelog: string
  downloadCount: number
  createdAt: number | null
}

export type ThingifyApiVersion = {
  id: string
  firmwareId: string
  version: string
  changelog: string
  tag: string
  downloadCount: number
  createdAt: number | null
  files: ThingifyApiVersionFile[]
}

export type ThingifyApiVersionFile = {
  id: string
  fileName: string
  fileSize: number
  createdAt: number | null
  downloadUrl: string
}
