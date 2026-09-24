import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { SettingsStore } from '@server/stores/settingsStore'
import { readFromFile, writeToFile } from '@server/services/files/fileService'
import { defaultSettings } from '@server/static/defaultSettings'
import { Settings } from '@shared/types'

vi.mock('os', () => ({
  default: {
    networkInterfaces: vi.fn()
  },
  networkInterfaces: vi.fn()
}))

vi.mock('@server/utils/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
    info: vi.fn()
  }
}))

vi.mock('@server/services/files/fileService', () => ({
  default: {
    writeToFile: vi.fn(),
    readFromFile: vi.fn()
  },
  writeToFile: vi.fn(),
  readFromFile: vi.fn()
}))

vi.mock('electron/main', () => {
  return {
    app: {
      getVersion: vi.fn().mockReturnValue('0.10.8')
    }
  }
})

vi.mock('electron', () => {
  return {
    app: {
      getVersion: vi.fn().mockReturnValue('0.10.8')
    }
  }
})

vi.mock('auto-launch', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      enable: vi.fn(),
      disable: vi.fn()
    }))
  }
})

describe('SettingsStore', () => {
  let settingsStore: SettingsStore

  beforeEach(async () => {
    vi.mocked(readFromFile).mockResolvedValue(undefined)
    settingsStore = new SettingsStore()
    await settingsStore.initialize()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetModules()
  })

  describe('Settings Management', () => {
    it('preserves usable legacy values while replacing invalid fields', async () => {
      vi.mocked(readFromFile).mockResolvedValueOnce({ version: '0.9.0', server_minimizeApp: false, device_devicePort: 'bad', adb_blacklist: ['one'], flag_misc: null })
      const store = new SettingsStore()
      const settings = await store.getSettings()
      expect(settings.server_minimizeApp).toBe(false)
      expect(settings.device_devicePort).toBe(defaultSettings.device_devicePort)
      expect(settings.adb_blacklist).toEqual(['one'])
      expect(settings.flag_misc).toBeUndefined()
    })

    it('does not save defaults over unreadable settings', async () => {
      vi.mocked(readFromFile).mockRejectedValueOnce(new Error('Permission denied'))
      const store = new SettingsStore()
      await store.initialize()
      expect(writeToFile).not.toHaveBeenCalled()
    })

    it('does not commit or notify on a failed save', async () => {
      const listener = vi.fn()
      settingsStore.addSettingsListener(listener)
      vi.mocked(writeToFile).mockRejectedValueOnce(new Error('Disk full'))
      await expect(settingsStore.saveSetting('device_devicePort', 9998)).rejects.toThrow('Disk full')
      expect(await settingsStore.getSetting('device_devicePort')).toBe(defaultSettings.device_devicePort)
      expect(listener).not.toHaveBeenCalled()
    })

    it('serializes concurrent settings updates and protects in-memory state from callers', async () => {
      await Promise.all([settingsStore.saveSetting('device_devicePort', 9998), settingsStore.saveSetting('server_callbackPort', 9999)])
      const settings = await settingsStore.getSettings()
      expect(settings.device_devicePort).toBe(9998)
      expect(settings.server_callbackPort).toBe(9999)
      settings.adb_blacklist.push('outside mutation')
      expect(await settingsStore.getSetting('adb_blacklist')).toEqual([])
    })

    it('rejects invalid ports from runtime callers', async () => {
      await expect(settingsStore.saveSetting('device_devicePort', 0)).rejects.toThrow('Invalid value')
      expect(writeToFile).not.toHaveBeenCalled()
    })
    it('should disable usage diagnostics by default', async () => {
      expect(await settingsStore.getSetting('flag_collectStats')).toBe(false)
      expect(await settingsStore.getSetting('privacy_statsConsentVersion')).toBe(1)
    })

    it('should reset legacy statistics settings until the user explicitly opts in', async () => {
      const legacySettings = {
        ...defaultSettings,
        version: '0.11.17',
        flag_collectStats: true
      } as Settings
      delete (legacySettings as Partial<Settings>).privacy_statsConsentVersion

      vi.mocked(readFromFile).mockResolvedValueOnce(legacySettings)

      const migratedStore = new SettingsStore()
      await migratedStore.initialize()

      expect(await migratedStore.getSetting('flag_collectStats')).toBe(false)
      expect(await migratedStore.getSetting('privacy_statsConsentVersion')).toBe(1)
      expect(writeToFile).toHaveBeenCalledWith(
        expect.objectContaining({
          flag_collectStats: false,
          privacy_statsConsentVersion: 1
        }),
        'settings.json'
      )
    })

    it('should handle multiple setting updates in sequence', async () => {
      await settingsStore.saveSetting('server_callbackPort', 9999)
      await settingsStore.saveSetting('device_devicePort', 9998)
      const settings = await settingsStore.getSettings()
      expect(settings?.server_callbackPort).toBe(9999)
      expect(settings?.device_devicePort).toBe(9998)
    })

    it('should notify listeners when settings are updated', async () => {
      const mockListener = vi.fn()
      settingsStore.addSettingsListener(mockListener)
      await settingsStore.saveSetting('server_minimizeApp', false)
      expect(mockListener).toHaveBeenCalled()
    })
  })

  describe('Cache Management', () => {
    it('should maintain settings after cache clear', async () => {
      await settingsStore.saveSetting('server_minimizeApp', false)
      await settingsStore.clearCache()
      const settings = await settingsStore.getSettings()
      expect(settings?.server_minimizeApp).toBe(false)
    })

    it('should save settings to file when requested', async () => {
      await settingsStore.saveToFile()
      expect(writeToFile).toHaveBeenCalled()
    })
  })
})
