import { SettingsStoreClass } from '@shared/stores/settingsStore'

const DEFAULT_DEVICE_PORT = 8891
const DEFAULT_DEVICE_ADDRESS = '0.0.0.0'

export interface DeviceConnectionOptions extends Record<string, unknown> {
  address: string
  port: number
}

export const getDeviceConnectionOptions = async (
  settingsStore: SettingsStoreClass
): Promise<DeviceConnectionOptions> => {
  const [configuredPort, configuredAddress] = await Promise.all([
    settingsStore.getSetting('device_devicePort'),
    settingsStore.getSetting('device_address')
  ])

  const port =
    typeof configuredPort === 'number' &&
    Number.isInteger(configuredPort) &&
    configuredPort >= 1 &&
    configuredPort <= 65_535
      ? configuredPort
      : DEFAULT_DEVICE_PORT
  const address =
    typeof configuredAddress === 'string' && configuredAddress.trim()
      ? configuredAddress.trim()
      : DEFAULT_DEVICE_ADDRESS

  return { address, port }
}
