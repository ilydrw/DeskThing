import { LOG_CONTEXTS, LOG_FILTER, Settings } from '@shared/types'

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const assertRecord = (value: unknown): void => {
  if (!isRecord(value)) throw new Error('Expected an object')
}

const boolean = (value: unknown): boolean => typeof value === 'boolean'
const string = (value: unknown): boolean => typeof value === 'string'
const strings = (value: unknown): boolean => Array.isArray(value) && value.every(string)
const port = (value: unknown): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65535

const validators: { [K in keyof Required<Settings>]: (value: unknown) => boolean } = {
  version: string,
  server_LogLevel: (value) => Object.values(LOG_FILTER).some((level) => level === value),
  server_LogContext: (value) => Array.isArray(value) && value.every((context) => Object.values(LOG_CONTEXTS).includes(context)),
  server_autoStart: boolean,
  server_minimizeApp: boolean,
  server_startMinimized: boolean,
  server_localIp: strings,
  server_callbackPort: port,
  device_devicePort: port,
  device_address: (value) => typeof value === 'string' && value.trim().length > 0,
  music_playbackLocation: string,
  music_refreshInterval: (value) => typeof value === 'number' && Number.isFinite(value) && (value < 0 || value >= 100) && value <= 2147483647,
  adb_useGlobal: boolean,
  adb_autoConfig: boolean,
  adb_autoDetect: boolean,
  adb_blacklist: strings,
  flag_firstClose: boolean,
  flag_hasOpened: boolean,
  flag_collectStats: boolean,
  privacy_statsConsentVersion: (value) => typeof value === 'number' && Number.isInteger(value) && value >= 0,
  flag_nerd: boolean,
  flag_misc: (value) => isRecord(value) && Object.values(value).every(boolean)
}

export const isSettingValue = <K extends keyof Settings>(key: K, value: unknown): value is Settings[K] =>
  Object.hasOwn(validators, key) && validators[key](value)

/** Retain valid preferences from older versions and fill missing/invalid fields independently. */
export const normalizeSettings = (value: unknown, defaults: Settings): Settings => {
  const result = structuredClone(defaults)
  if (!isRecord(value)) return result
  const copySetting = <K extends keyof Settings>(key: K): void => {
    const candidate = value[key]
    if (isSettingValue(key, candidate)) result[key] = structuredClone(candidate)
  }
  const keys = Object.keys(validators) as Array<keyof Settings>
  keys.forEach(copySetting)
  return result
}
