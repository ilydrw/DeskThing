import type { Stats, Registration, Stat } from '@shared/types'
import { DeskThingStats } from '@server/services/stats/statsFetchWrapper'
import logger from '@server/utils/logger'
import { getMachineId } from '@server/utils/machineId'
import os from 'os'
import { StatsStoreClass } from '@shared/stores/statsStore'
import { handleError } from '@server/utils/errorHandler'
import { SettingsStoreClass } from '@shared/stores/settingsStore'
import { getServiceConfig } from '@server/config/serviceConfig'

export class StatsStore implements StatsStoreClass {
  private stats: DeskThingStats | null = null
  private statsQueue: Map<string, { stat: Stat; timestamp: number }> = new Map()
  private _initialized = false
  private _registered = false
  private _flushing = false
  private _enabling = false
  private collectStats = false
  private flushInterval: NodeJS.Timeout | null = null
  private removeSettingsListener: (() => void) | null = null
  private readonly FLUSH_INTERVAL = 60 * 60 * 1000 * 12 // 12 hours

  public get initialized(): boolean {
    return this._initialized
  }

  constructor(private settingStore: SettingsStoreClass) {}

  async initialize(): Promise<void> {
    if (this._initialized) return

    this.collectStats = (await this.settingStore.getSetting('flag_collectStats')) === true
    this.removeSettingsListener = this.settingStore.on(
      'flag_collectStats',
      async (collectStats) => {
        this.collectStats = collectStats

        if (collectStats) {
          logger.info('User opted in to stats collection', {
            function: 'settings-updated',
            source: 'statsStore'
          })
          await this.enableCollection()
        } else {
          this.disableCollection()
          logger.info('User opted out of stats collection', {
            function: 'settings-updated',
            source: 'statsStore'
          })
        }
      }
    )

    this._initialized = true

    if (this.collectStats) {
      await this.enableCollection()
    } else {
      logger.info('Stats collection is disabled', {
        function: 'initialize',
        source: 'statsStore'
      })
    }
  }

  private async enableCollection(): Promise<void> {
    if (this.stats || this._enabling || !this.collectStats) return

    const { statsUrl } = getServiceConfig()
    if (!statsUrl) {
      logger.warn('Stats collection is enabled, but no valid stats service is configured', {
        function: 'enableCollection',
        source: 'statsStore'
      })
      return
    }

    this._enabling = true

    try {
      let privateKeyData = process.env.DESKTHING_STATS_PRIVATE_KEY
      let clientId = process.env.DESKTHING_STATS_CLIENT_ID

      if (!privateKeyData || !clientId) {
        const machineData = await getMachineId()
        privateKeyData = machineData.privateKey
        clientId = machineData.clientId

        logger.info('Using machine-generated keys for stats', {
          function: 'enableCollection',
          source: 'statsStore'
        })
      }

      const privateKey = await DeskThingStats.readPrivateKey(privateKeyData)
      this.stats = new DeskThingStats(clientId, privateKey, { baseUrl: statsUrl })

      await this.ensureRegistration()
      this.startFlushInterval()

      logger.info('Stats collection initialized', {
        function: 'enableCollection',
        source: 'statsStore'
      })
    } catch (error) {
      this.stats = null
      logger.error('Failed to initialize stats collection', {
        error: error as Error,
        function: 'enableCollection',
        source: 'statsStore'
      })
    } finally {
      this._enabling = false
    }
  }

  private disableCollection(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }

    this.statsQueue.clear()
    this.stats = null
    this._registered = false
    this._flushing = false
  }

  private async ensureRegistration(): Promise<void> {
    if (!this.stats || this._registered || !this.collectStats) return

    try {
      const machineData = await getMachineId()
      const registration: Registration = {
        id: machineData.clientId,
        publicKey: machineData.publicKey,
        os: os.platform(),
        cpus: os.cpus().length,
        memory: os.totalmem()
      }

      this._registered = await this.register(registration)
    } catch (error) {
      logger.error('Failed to ensure registration', {
        error: error as Error,
        function: 'ensureRegistration',
        source: 'statsStore'
      })
    }
  }

  private startFlushInterval(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
    }
    this.flushInterval = setInterval(() => {
      logger.debug('Flushing stats queue due to interval', {
        function: 'startFlushInterval',
        source: 'statsStore'
      })
      this.flush()
    }, this.FLUSH_INTERVAL)
  }

  async clearCache(): Promise<void> {
    this.statsQueue.clear()
  }

  async saveToFile(): Promise<void> {
    await this.flush()
  }

  async register(registration: Registration): Promise<boolean> {
    if (!this.stats || !this.collectStats) {
      logger.warn('Stats collection is not available', {
        function: 'register',
        source: 'statsStore'
      })
      return false
    }

    if (process.env.NODE_ENV == 'development') {
      logger.debug('Skipping registration in development mode', {
        function: 'register',
        source: 'statsStore'
      })
      return true
    }

    try {
      const result = await this.stats.register(registration)
      if (!result.success) {
        throw new Error(result.error.message)
      }
      logger.info('Registration successful', {
        function: 'register',
        source: 'statsStore'
      })
      return true
    } catch (error) {
      logger.error('Failed to register', {
        error: error as Error,
        function: 'register',
        source: 'statsStore'
      })
      return false
    }
  }

  private generateStatKey(stat: Stat): string {
    switch (stat.stat) {
      case 'system':
        return `system:${stat.type}` // Only one system stat per type

      case 'usage':
        return `usage:${stat.type}` // Only latest usage stat per type

      case 'app':
        if (stat.type === 'summary') {
          return 'app:summary' // Only one summary
        }
        return `app:${stat.type}:${stat.data.appId}` // Per app for install/uninstall/update

      case 'kv':
        return `kv:${stat.type}:${stat.key}` // Per key per type

      default: {
        // Ensure stat has a 'stat' property, otherwise fallback to a generic key
        if ('stat' in stat) {
          return `${(stat as Stat).stat}:${Date.now()}` // Fallback with timestamp
        }
        return `unknown:${Date.now()}`
      }
    }
  }

  /**
   * Determine if a stat should always be sent (no deduplication)
   */
  private shouldAlwaysSend(stat: Stat): boolean {
    return (
      stat.stat === 'app' &&
      (stat.type === 'install' || stat.type === 'uninstall' || stat.type === 'update')
    )
  }

  async collect(stat: Stats[number]): Promise<void> {
    if (!this.collectStats || !this.stats) return

    const key = this.generateStatKey(stat)
    const timestamp = Date.now()

    if (this.shouldAlwaysSend(stat)) {
      this.statsQueue.set(`${key}:${timestamp}`, { stat, timestamp })
    } else {
      // Check if we already have this stat type
      const existing = this.statsQueue.get(key)

      if (!existing) {
        this.statsQueue.set(key, { stat, timestamp })

        logger.debug(`Queued stat: ${stat.stat}:${stat.type}`, {
          function: 'collect',
          source: 'statsStore'
        })
      } else {
        // If we already have this stat type, check if it's newer
        if (timestamp > existing.timestamp) {
          this.statsQueue.set(key, { stat, timestamp })
          logger.debug(`Updated stat: ${stat.stat}:${stat.type}`, {
            function: 'collect',
            source: 'statsStore'
          })
        } else {
          logger.debug(`Skipped older duplicate stat: ${stat.stat}:${stat.type}`, {
            function: 'collect',
            source: 'statsStore'
          })
        }
      }
    }

    // If queue gets too large, flush early
    if (this.statsQueue.size >= 50) {
      // Reduced threshold due to deduplication
      logger.debug('Stats queue size exceeded threshold, flushing', {
        function: 'collect',
        source: 'statsStore'
      })
      await this.flush()
    }
  }

  private getSortedStats(): Stat[] {
    const entries = Array.from(this.statsQueue.values())

    // Sort by priority (registration first, then by timestamp)
    return entries
      .sort((a, b) => {
        // Registration stats first
        if (a.stat.stat === 'system' && b.stat.stat !== 'system') return -1
        if (a.stat.stat !== 'system' && b.stat.stat === 'system') return 1

        // Then by timestamp (oldest first)
        return a.timestamp - b.timestamp
      })
      .map((entry) => entry.stat)
  }

  private async flush(): Promise<void> {
    if (!this.collectStats || !this.stats || this.statsQueue.size === 0) return

    if (this._flushing) {
      logger.debug('Flush already in progress, skipping', {
        function: 'flush',
        source: 'statsStore'
      })
      return
    }
    this._flushing = true

    const statsToSend = this.getSortedStats()

    try {
      if (process.env.NODE_ENV == 'development') {
        logger.debug('Skipping stats flush in development mode', {
          function: 'flush',
          source: 'statsStore'
        })
        return
      }

      const result = await this.stats.send(statsToSend)
      if (result.success) {
        this.statsQueue.clear()
        logger.debug('Stats flushed successfully', {
          function: 'flush',
          source: 'statsStore'
        })
      } else {
        throw new Error(result.error.message)
      }
    } catch (error) {
      logger.error(`Failed to flush stats ${handleError(error)}`, {
        error: error as Error,
        function: 'flush',
        source: 'statsStore'
      })
    } finally {
      this._flushing = false
    }
  }

  dispose(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }

    this.removeSettingsListener?.()
    this.removeSettingsListener = null

    this.flush().catch((error) => {
      logger.error('Failed to flush stats during disposal', {
        error: error as Error,
        function: 'dispose',
        source: 'statsStore'
      })
    })

    this._initialized = false
  }
}
