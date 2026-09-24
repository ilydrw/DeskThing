import { describe, expect, it, vi } from 'vitest'
import { SettingsStoreClass } from '@shared/stores/settingsStore'
import { getDeviceConnectionOptions } from '@server/stores/platforms/platformConfig'

const createSettingsStore = (
  values: Partial<Record<'device_address' | 'device_devicePort', unknown>>
): SettingsStoreClass =>
  ({
    getSetting: vi.fn(async (key: 'device_address' | 'device_devicePort') => values[key])
  }) as unknown as SettingsStoreClass

describe('getDeviceConnectionOptions', () => {
  it('returns the configured bind address and port', async () => {
    const store = createSettingsStore({
      device_address: ' 127.0.0.1 ',
      device_devicePort: 18991
    })

    await expect(getDeviceConnectionOptions(store)).resolves.toEqual({
      address: '127.0.0.1',
      port: 18991
    })
  })

  it.each([0, -1, 65_536, Number.NaN, 1.5])(
    'falls back when the configured port is invalid: %s',
    async (port) => {
      const store = createSettingsStore({
        device_address: '',
        device_devicePort: port
      })

      await expect(getDeviceConnectionOptions(store)).resolves.toEqual({
        address: '0.0.0.0',
        port: 8891
      })
    }
  )
})
