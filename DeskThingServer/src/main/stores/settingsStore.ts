import { Settings, CacheableStore } from '@shared/types'
import { SettingsListener, SettingsStoreClass, SettingsStoreListener } from '@shared/stores/settingsStore'
import { readFromFile, writeToFile } from '../services/files/fileService'
import Logger from '@server/utils/logger'
import { defaultSettings } from '@server/static/defaultSettings'
import { app } from 'electron/main'
import { assertRecord, isRecord, isSettingValue, normalizeSettings } from '@shared/validation/settings'

const STATS_CONSENT_VERSION = 1

export class SettingsStore implements CacheableStore, SettingsStoreClass {
  private settings: Settings | undefined
  private settingsFilePath = 'settings.json'
  private globalListeners: SettingsListener[] = []
  private _initialized = false
  private initialization?: Promise<void>
  private pendingSave: Promise<void> = Promise.resolve()

  public get initialized(): boolean { return this._initialized }

  async initialize(): Promise<void> {
    if (this._initialized) return
    this.initialization ??= this.loadSettings().then((settings) => {
      this.settings = settings
      this._initialized = true
    }).finally(() => { this.initialization = undefined })
    await this.initialization
  }

  clearCache = async (): Promise<void> => {
    // Settings stay resident because connection and logging services depend on them.
  }

  saveToFile = async (): Promise<void> => { await this.saveSettings() }

  private async notifyListeners(): Promise<void> {
    if (!this.settings) return
    const snapshot = structuredClone(this.settings)
    await Promise.all(this.globalListeners.map(async (listener) => {
      try {
        await listener(structuredClone(snapshot))
      } catch (error) {
        Logger.error('Settings listener failed', {
          source: 'settingsStore', function: 'notifyListeners', error: error as Error
        })
      }
    }))
  }

  public async saveSettings(settings?: Settings): Promise<void> {
    const snapshot = settings ? normalizeSettings(settings, defaultSettings) : undefined
    await this.updateSettings((current) => snapshot ?? current)
  }

  private async updateSettings(update: (current: Settings) => Settings): Promise<void> {
    const saved = this.pendingSave.then(async () => {
      await this.initialize()
      const next = update(structuredClone(this.settings ?? defaultSettings))
      await writeToFile(next, this.settingsFilePath)
      // Do not announce or commit a setting that could not be saved.
      this.settings = next
    })
    this.pendingSave = saved.catch(() => undefined)
    await saved
    await this.notifyListeners()
  }

  private async loadSettings(): Promise<Settings> {
    let stored: unknown
    try {
      stored = await readFromFile<unknown>(this.settingsFilePath, assertRecord)
    } catch (error) {
      Logger.warn('Unable to read settings; using defaults in memory without overwriting the file', {
        source: 'settingsStore', function: 'loadSettings', error: error as Error
      })
      return structuredClone(defaultSettings)
    }

    const data = normalizeSettings(stored, defaultSettings)
    data.version = app.getVersion()
    if (!isRecord(stored) || stored.privacy_statsConsentVersion !== STATS_CONSENT_VERSION) {
      data.flag_collectStats = false
      data.privacy_statsConsentVersion = STATS_CONSENT_VERSION
    }
    if (JSON.stringify(stored) !== JSON.stringify(data)) {
      try {
        await writeToFile(data, this.settingsFilePath)
      } catch (error) {
        Logger.warn('Unable to persist migrated settings; retaining usable settings in memory', {
          source: 'settingsStore', function: 'loadSettings', error: error as Error
        })
      }
    }
    return data
  }

  public getSettings = async (): Promise<Settings> => {
    await this.initialize()
    return structuredClone(this.settings ?? defaultSettings)
  }

  public getSetting = async <K extends keyof Settings>(key: K): Promise<Settings[K] | undefined> => {
    return (await this.getSettings())[key]
  }

  public addSettingsListener(listener: SettingsListener): () => void {
    this.globalListeners.push(listener)
    return () => { this.globalListeners = this.globalListeners.filter((l) => l !== listener) }
  }

  public on<K extends keyof Settings>(key: K, listener: SettingsStoreListener<K>): () => void {
    let currentSetting = this.settings?.[key]
    return this.addSettingsListener(async (settings) => {
      if (settings[key] === currentSetting && typeof currentSetting !== 'object') return
      currentSetting = settings[key]
      await listener(settings[key])
    })
  }

  public async saveSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
    if (!isSettingValue(key, value)) throw new Error('Invalid value for setting ' + key)
    const snapshot = structuredClone(value)
    await this.updateSettings((settings) => {
      settings[key] = snapshot
      return settings
    })
  }

  public async setFlag(flag: string, value: boolean): Promise<void> {
    if (typeof flag !== 'string' || !flag || typeof value !== 'boolean') throw new Error('Invalid flag')
    await this.updateSettings((settings) => ({
      ...settings, flag_misc: { ...settings.flag_misc, [flag]: value }
    }))
  }

  public async toggleFlag(flagId: string): Promise<boolean> {
    if (typeof flagId !== 'string' || !flagId) throw new Error('Invalid flag')
    let next = false
    await this.updateSettings((settings) => {
      next = !(Object.hasOwn(settings.flag_misc ?? {}, flagId) && settings.flag_misc?.[flagId])
      return { ...settings, flag_misc: { ...settings.flag_misc, [flagId]: next } }
    })
    return next
  }

  public async getFlag(flagId: string): Promise<boolean> {
    const flags = (await this.getSettings()).flag_misc
    return flags && Object.hasOwn(flags, flagId) ? flags[flagId] === true : false
  }
}
