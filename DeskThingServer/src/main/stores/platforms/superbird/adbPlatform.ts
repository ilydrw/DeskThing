import {
  Client,
  DeskThingToDeviceCore,
  ClientManifest,
  ProviderCapabilities,
  ConnectionState,
  ClientIdentifier,
  PlatformIDs
} from '@deskthing/types'
import {
  PlatformEvents,
  PlatformInterface,
  PlatformStatus,
  PlatformEvent,
  PlatformConnectionOptions
} from '@shared/interfaces/platformInterface'
import EventEmitter from 'node:events'
import { ADBService } from './adbService'
import { storeProvider } from '@server/stores/storeProvider'
import logger from '@server/utils/logger'
import { PlatformIPC } from '@shared/types/ipc/ipcPlatform'
import { progressBus } from '@server/services/events/progressBus'
import { ProgressChannel, SCRIPT_IDs } from '@shared/types'
import { handleError } from '@server/utils/errorHandler'
import { ClientIdentificationService } from '@server/services/clients/clientIdentificationService'
import { updateManifest } from '@server/services/client/clientService'

export class ADBPlatform extends EventEmitter<PlatformEvents> implements PlatformInterface {
  private adbService: ADBService
  private isActive: boolean = false
  private startTime: number = 0
  private clients: Client[] = []
  private initialized: boolean = false
  private intervalId: NodeJS.Timeout | null = null
  private settingsCleanup: (() => void) | null = null
  private autoDetect = false
  private refreshInProgress = false
  private missingDeviceChecks: Map<string, number> = new Map()
  private adbPort: number = 8891
  private readonly HEALTH_CHECK_INTERVAL = 30000
  private readonly MISSED_CHECKS_BEFORE_DISCONNECT = 2

  public readonly id: PlatformIDs = PlatformIDs.ADB
  public readonly name: string = 'ADB'

  readonly identifier: Omit<ClientIdentifier, 'id' | 'active'> = {
    providerId: PlatformIDs.ADB,
    capabilities: [ProviderCapabilities.CONFIGURE, ProviderCapabilities.PING],
    connectionState: ConnectionState.Established
  }

  constructor() {
    super()
    this.adbService = new ADBService()
  }

  fetchClients = async (): Promise<Client[]> => {
    await this.refreshClients()
    return this.clients
  }

  private getInternalId(clientId: string): string | undefined {
    // Early quick lookup if the client hasn't been changed or taken
    if (this.clients[clientId]) {
      return clientId
    }

    const client = this.clients.find(
      (c) => c.clientId === clientId || c.identifiers[this.id]?.id === clientId
    )
    return client?.identifiers[this.id]?.id
  }

  public handlePlatformEvent = async <T extends PlatformIPC>(data: T): Promise<T['data']> => {
    if (data.platform !== PlatformIDs.ADB) return undefined

    switch (data.type) {
      case 'get':
        switch (data.request) {
          case 'manifest': {
            const manifest = await this.adbService.getDeviceManifest(data.adbId)
            return manifest
          }
          case 'devices': {
            return this.clients
          }
          default:
            break
        }
        break
      case 'set': {
        switch (data.request) {
          case 'manifest': {
            const update = progressBus.start(
              ProgressChannel.PLATFORM_CHANNEL,
              `ADB: Starting ${data.type}:${data.request}`,
              `Handling ${data.request}`
            )
            await this.updateClientManifest(data.manifest)
            update('Completed Successfully', 100)
            break
          }
          case 'supervisor': {
            progressBus.startOperation(
              ProgressChannel.PLATFORM_CHANNEL,
              'Setting Supervisor',
              'Initializing Supervisor Request',
              [
                {
                  channel: ProgressChannel.ST_ADB_SUPERVISOR,
                  weight: 75
                },
                {
                  channel: ProgressChannel.REFRESH_DEVICES,
                  weight: 25
                }
              ]
            )
            await this.adbService.toggleSupervisorService(data.adbId, data.service, data.state)
            progressBus.update(ProgressChannel.PLATFORM_CHANNEL, 'Refreshing Client')
            await this.refreshClient(data.adbId, true)
            progressBus.complete(ProgressChannel.PLATFORM_CHANNEL, 'Completed Successfully')
            return true
          }
          case 'brightness': {
            progressBus.startOperation(
              ProgressChannel.PLATFORM_CHANNEL,
              'Setting Brightness',
              'Initializing Brightness Request',
              [
                {
                  channel: ProgressChannel.ADB,
                  weight: 50
                },
                {
                  channel: ProgressChannel.REFRESH_DEVICES,
                  weight: 50
                }
              ]
            )
            await this.adbService.setBrightness(data.adbId, data.brightness)
            await this.refreshClient(data.adbId, true)
            progressBus.complete(ProgressChannel.PLATFORM_CHANNEL, 'Completed Successfully')
            return true
          }
          default:
            break
        }
        break
      }
      case 'push':
        {
          switch (data.request) {
            case 'staged':
              progressBus.startOperation(
                ProgressChannel.PLATFORM_CHANNEL,
                'Push Staged Client',
                'Initializing push',
                [
                  {
                    channel: ProgressChannel.CONFIGURE_DEVICE,
                    weight: 100
                  }
                ]
              )
              try {
                await this.pushStagedClient(data.adbId, this.adbPort)
                progressBus.complete(ProgressChannel.PLATFORM_CHANNEL, 'Push complete')
              } catch (error) {
                progressBus.error(
                  ProgressChannel.PLATFORM_CHANNEL,
                  'Error pushing staged client',
                  handleError(error),
                  'ADB Error'
                )
              }
              return
            case 'script': {
              progressBus.startOperation(
                ProgressChannel.PLATFORM_CHANNEL,
                'Running Script',
                `Running ${data.scriptId}`,
                [
                  {
                    channel: ProgressChannel.PUSH_SCRIPT,
                    weight: 100
                  }
                ]
              )
              try {
                const result = await this.adbService.runScript(data.scriptId, {
                  deviceId: data.adbId,
                  force: data.force
                })
                progressBus.complete(
                  ProgressChannel.PLATFORM_CHANNEL,
                  `Script complete. Result: ${result}`
                )
                return result
              } catch (error) {
                progressBus.error(
                  ProgressChannel.PLATFORM_CHANNEL,
                  'Error running script',
                  handleError(error),
                  'Script Error'
                )
              }
            }
          }
        }
        break
      case 'refresh': {
        progressBus.startOperation(
          ProgressChannel.PLATFORM_CHANNEL,
          'Refreshing Devices',
          'Initializing refresh',
          [
            {
              channel: ProgressChannel.ST_ADB_REFRESH,
              weight: 100
            }
          ]
        )
        await this.refreshDevices()
        const clients = await this.getClients()
        progressBus.complete(ProgressChannel.PLATFORM_CHANNEL, 'Refresh complete')
        return clients
      }
      case 'run': {
        progressBus.startOperation(
          ProgressChannel.PLATFORM_CHANNEL,
          'Running ADB command',
          `Running ${data.command}`,
          [
            {
              channel: ProgressChannel.ADB,
              weight: 100
            }
          ]
        )

        const response = await this.adbService.sendCommand(data.command, data.adbId)

        progressBus.complete(
          ProgressChannel.PLATFORM_CHANNEL,
          `Got response ${response.substring(0, 15)}...`,
          'Successfully Ran Command'
        )
        return response
      }

      case 'configure': {
        progressBus.startOperation(
          ProgressChannel.PLATFORM_CHANNEL,
          `Configuring Device`,
          `Configuring ${data.adbId || 'unknown device'}`,
          [
            {
              channel: ProgressChannel.CONFIGURE_DEVICE,
              weight: 75
            },
            {
              channel: ProgressChannel.PUSH_SCRIPT,
              weight: 25
            }
          ]
        )

        try {
          await this.adbService.runScript(SCRIPT_IDs.RESTART, {
            deviceId: data.adbId,
            reboot: false
          })
          await this.adbService.configureDevice(data.adbId, this.adbPort)

          progressBus.complete(ProgressChannel.PLATFORM_CHANNEL, 'Completed Operation')
          return true
        } catch (error) {
          progressBus.error(
            ProgressChannel.PLATFORM_CHANNEL,
            'Error configuring device',
            handleError(error)
          )
          return false
        }
      }
    }

    return undefined
  }

  private async updateClientManifest(manifest: Partial<ClientManifest>): Promise<void> {
    await updateManifest(manifest)
  }

  async start(options: PlatformConnectionOptions): Promise<void> {
    if (this.isActive) return
    this.adbPort = options.port ?? this.adbPort
    this.isActive = true
    this.startTime = Date.now()

    if (!this.initialized) {
      await this.initialize()
    }
    if (this.autoDetect) {
      await this.refreshDevices()
    }
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return

    const settingStore = await storeProvider.getStore('settingsStore')
    const autoDetectADB = await settingStore.getSetting('adb_autoDetect')

    this.restartInterval(autoDetectADB)

    this.settingsCleanup = settingStore.on('adb_autoDetect', (autoDetect) => {
      this.restartInterval(autoDetect)
      if (autoDetect && this.isActive) {
        void this.refreshDevices().catch((error) => {
          logger.error('Failed to refresh devices after enabling ADB auto detection', {
            domain: 'adbPlatform',
            function: 'initialize',
            error: error instanceof Error ? error : new Error(String(error))
          })
        })
      }
    })
    this.initialized = true
  }

  private restartInterval(autoDetect?: boolean): void {
    this.autoDetect = Boolean(autoDetect)
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }

    logger.debug(`Auto detect is ${autoDetect}`, {
      domain: 'adbPlatform',
      function: 'restartInterval'
    })

    if (!autoDetect) {
      this.intervalId = null
      return
    }

    this.intervalId = setInterval(() => {
      this.runHealthCheck().catch((error) => {
        logger.error('ADB health check failed', {
          domain: 'adbPlatform',
          function: 'runHealthCheck',
          error: error as Error
        })
      })
    }, this.HEALTH_CHECK_INTERVAL)
  }

  private async runHealthCheck(): Promise<void> {
    if (!this.isActive || this.refreshInProgress) return

    const devices = await this.adbService.getDevices()
    const currentDeviceIds = this.clients
      .map((client) => client.identifiers[this.id]?.id)
      .filter((id): id is string => Boolean(id))
    const detectedDevices = new Set(devices)
    const currentDevices = new Set(currentDeviceIds)

    logger.debug(`Autodetected devices: ${devices.join(', ') || 'none'}`, {
      domain: 'adbPlatform',
      function: 'runHealthCheck'
    })

    await Promise.allSettled(
      devices.map(async (deviceId) => {
        await this.adbService.openPort(deviceId, this.adbPort)
      })
    )

    for (const deviceId of devices) {
      this.missingDeviceChecks.delete(deviceId)
    }

    const hasNewDevice = devices.some((deviceId) => !currentDevices.has(deviceId))
    const hasConfirmedRemoval = currentDeviceIds.some((deviceId) => {
      if (detectedDevices.has(deviceId)) return false

      const missedChecks = (this.missingDeviceChecks.get(deviceId) ?? 0) + 1
      this.missingDeviceChecks.set(deviceId, missedChecks)
      return missedChecks >= this.MISSED_CHECKS_BEFORE_DISCONNECT
    })

    if (hasNewDevice || hasConfirmedRemoval) {
      logger.info('ADB device set changed; refreshing platform clients', {
        domain: 'adbPlatform',
        function: 'runHealthCheck'
      })
      await this.refreshDevices({ devices, reportProgress: false })
    }
  }

  private async refreshDevices(
    options: { devices?: string[]; reportProgress?: boolean } = {}
  ): Promise<void> {
    if (this.refreshInProgress) return
    this.refreshInProgress = true
    const reportProgress = options.reportProgress ?? true

    try {
      if (reportProgress) {
        progressBus.startOperation(
          ProgressChannel.ST_ADB_REFRESH,
          'Refreshing Devices',
          'Initializing refresh',
          [
            {
              channel: ProgressChannel.REFRESH_DEVICES,
              weight: 75
            },
            {
              channel: ProgressChannel.BLANK,
              weight: 25
            }
          ]
        )
      }
      const update = reportProgress
        ? progressBus.start(ProgressChannel.BLANK, 'Refresh Devices', 'getting devices')
        : (): void => undefined

      const adbDevices = options.devices ?? (await this.adbService.getDevices())
      update(`Found ${adbDevices.length} devices`, 30)

      update('Cleaning up old devices', 60)

      // Mark clients not found in ADB as disconnected
      this.clients.forEach((client) => {
        if (!adbDevices.includes(client.identifiers[this.id]?.id || '')) {
          this.emit(PlatformEvent.CLIENT_DISCONNECTED, client)
        }
      })

      // Restore reverse-port mappings for every detected device. These mappings
      // are lost when either ADB or the host restarts. One broken device should
      // not prevent the remaining devices from being refreshed.
      const portResults = await Promise.allSettled(
        adbDevices.map(async (adbId) => {
          logger.debug(`Opening port for ${adbId}`)
          await this.adbService.openPort(adbId, this.adbPort)
        })
      )
      portResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          logger.warn(`Unable to restore ADB port mapping for ${adbDevices[index]}`, {
            source: 'adbPlatform',
            function: 'refreshDevices',
            error: result.reason instanceof Error ? result.reason : new Error(String(result.reason))
          })
        }
      })

      const progressMultiplier = adbDevices.length > 0 ? 1 / adbDevices.length : 1

      for (const adbDevice of adbDevices) {
        await this.refreshClient(adbDevice, false, false, progressMultiplier, reportProgress)
      }

      // ensure the local list of clients is up to date
      this.clients = this.clients.filter((client) => {
        return adbDevices.find((adb) => adb === client.identifiers[this.id]?.id)
      })

      this.emit(PlatformEvent.CLIENT_LIST, this.clients)
      this.missingDeviceChecks.clear()
      if (reportProgress) {
        progressBus.complete(ProgressChannel.ST_ADB_REFRESH, 'Refresh complete')
      }
    } catch (error) {
      if (reportProgress) {
        progressBus.error(ProgressChannel.ST_ADB_REFRESH, 'Refresh failed', 'Refresh failed')
      }
      logger.error(`Failed to refresh devices`, {
        error: error as Error,
        function: 'refreshDevices',
        source: 'adbPlatform'
      })
    } finally {
      this.refreshInProgress = false
    }
  }

  async refreshClient(
    adbId: string,
    forceRefresh = false,
    notify = true,
    progressMultiplier = 1,
    reportProgress = true
  ): Promise<Client | undefined> {
    const existingClient = this.clients.find((client) => client.identifiers[this.id]?.id === adbId)

    if (reportProgress) {
      progressBus.start(
        ProgressChannel.REFRESH_DEVICES,
        `Refreshing ${adbId}`,
        `Refreshing ${adbId}`
      )
    }

    let totalProgress = 0
    const update = (message: string, progress: number): void => {
      const progressDelta = progress - totalProgress
      const updatedProgress = progressDelta * progressMultiplier
      totalProgress = progress
      if (reportProgress) {
        progressBus.incrementProgress(ProgressChannel.REFRESH_DEVICES, message, updatedProgress)
      }
    }

    try {
      update('Getting device version', 25)
      const deviceVersion = await this.adbService.getDeviceVersion(adbId)
      update('Getting device usid', 35)
      const usid = await this.adbService.getDeviceUSID(adbId)
      update('Getting device macBt', 45)
      const macBt = await this.adbService.getDeviceMacBT(adbId)
      update('Getting device brightness', 55)
      const brightness = await this.adbService.getDeviceBrightness(adbId)
      update('Getting device services', 65)
      const services = await this.adbService.getSupervisorStatus(adbId)

      const transformedServices: Record<string, boolean> = Object.entries(services).reduce(
        (acc, [key, val]) => {
          return {
            ...acc,
            [key]: val === 'RUNNING'
          }
        },
        {}
      )

      if (existingClient && !forceRefresh) {
        // Updates the existing client
        const updates: Client = {
          ...existingClient,
          connected: false,
          connectionState: ConnectionState.Established,
          timestamp: Date.now(),
          meta: {
            [this.id]: {
              adbId: adbId,
              device_version: deviceVersion,
              usid,
              offline: false,
              brightness: brightness,
              mac_bt: macBt,
              services: transformedServices
            }
          },
          identifiers: {
            [this.id]: {
              id: adbId,
              active: true,
              providerId: this.id,
              capabilities: this.identifier.capabilities,
              connectionState: ConnectionState.Established
            }
          }
        }

        if (!existingClient.manifest) {
          try {
            update(`Getting manifest for ${adbId}`, 70)
            const manifest = await this.adbService.getDeviceManifest(adbId)

            updates.manifest = manifest || undefined
          } catch (error) {
            logger.warn(`Failed to get manifest for device ${adbId}`, {
              error: error as Error,
              function: 'refreshDevices',
              source: 'adbPlatform'
            })
            // Continue without manifest updates if device is unreachable
          }
        }

        // This will eventually update this platform for the global client changes to take affect
        const existingIndex = this.clients.findIndex(
          (client) => client.identifiers[this.id]?.id === adbId
        )
        if (existingIndex !== -1) {
          this.clients[existingIndex] = updates
        }
        if (notify) {
          this.emit(PlatformEvent.CLIENT_UPDATED, updates)
        }
        update(`Finished updating ${adbId}`, 100)
        return updates
      } else {
        // first remove the client if it exists (i.e. if it is a forced refresh)
        this.clients = this.clients.filter((client) => client.identifiers[this.id]?.id !== adbId)
        const newClient: Client = {
          clientId: adbId,
          connectionState: ConnectionState.Established, // not actually connected
          identifiers: {
            [this.id]: {
              id: adbId,
              active: true,
              providerId: this.id,
              capabilities: this.identifier.capabilities,
              connectionState: ConnectionState.Established
            }
          },
          meta: {
            [this.id]: {
              adbId: adbId,
              device_version: deviceVersion,
              usid,
              offline: false,
              brightness: brightness,
              mac_bt: macBt,
              services: transformedServices
            }
          },
          connected: false,
          timestamp: Date.now()
        }

        try {
          update(`Getting manifest for ${adbId}`, 70)
          const manifest = await this.adbService.getDeviceManifest(adbId)

          if (manifest) {
            newClient.manifest = manifest
          }
        } catch (error) {
          update(`Failed to get manifest for device ${adbId}`, 70)
          logger.warn(`Failed to get manifest for device ${adbId}`, {
            error: error as Error,
            function: 'refreshDevices',
            source: 'adbPlatform'
          })
        }

        this.clients.push(newClient)
        if (notify) {
          this.emit(PlatformEvent.CLIENT_CONNECTED, newClient)
        }
        update(`Finished updating ${adbId}`, 100)
        return newClient
      }
    } catch (error) {
      logger.error(`Error refreshing devices: ${error}`, {
        function: 'refreshDevices',
        source: 'adbPlatform'
      })
      update(`Error updating ${adbId}. ${handleError(error)}`, 100)
      return
    }
  }
  private pushStagedClient(clientId: string, port: number): Promise<void> {
    return this.adbService.configureDevice(clientId, port, true)
  }

  async stop(): Promise<void> {
    if (!this.isActive) return
    this.isActive = false
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.settingsCleanup?.()
    this.settingsCleanup = null
    this.autoDetect = false
    this.missingDeviceChecks.clear()
    this.clients = []
    this.initialized = false
  }

  isRunning(): boolean {
    return this.isActive
  }

  getClients(): Client[] {
    return this.clients
  }

  getClientById(clientId: string): Client | undefined {
    const internalId = this.getInternalId(clientId)
    return this.clients.find((client) => client.identifiers[this.id]?.id === internalId)
  }

  public async updateClient(
    clientId: string,
    newClient: Partial<Client>,
    notify = true
  ): Promise<Client | undefined> {
    try {
      const internalId = this.getInternalId(clientId)
      const index = this.clients.findIndex(
        (client) => client.identifiers[this.id]?.id === internalId
      )
      if (index === -1) {
        console.error(`Unable to find the client for id ${clientId}`)
        return undefined
      }

      const client = this.clients[index]
      // a deeper merge of clients ensuring no important data is lost
      const updatedClient = ClientIdentificationService.mergeClients(client, newClient as Client)

      this.clients[index] = updatedClient
      if (notify) this.emit(PlatformEvent.CLIENT_UPDATED, updatedClient)
      return updatedClient
    } catch (error) {
      console.error('Error updating client:', error)
      this.emit(
        PlatformEvent.ERROR,
        error instanceof Error
          ? error
          : new Error('Unknown error occurred updating client: ' + handleError(error), {
              cause: error
            })
      )
    }
    return undefined
  }

  async refreshClients(progressMultiplier: number = 1): Promise<boolean> {
    progressBus.startOperation(
      ProgressChannel.REFRESH_CLIENTS,
      'Refreshing ADB',
      'Refreshing ADB',
      [
        {
          channel: ProgressChannel.ST_ADB_REFRESH,
          weight: 100 * progressMultiplier
        },
        {
          channel: ProgressChannel.BLANK, // this is to set the transform on the sub operations
          weight: 100 * (1 - progressMultiplier)
        }
      ]
    )

    await this.refreshDevices()
    progressBus.complete(ProgressChannel.ST_ADB_REFRESH, 'Refreshed ADB Devices')
    progressBus.update(ProgressChannel.REFRESH_CLIENTS, 'Refreshed Devices')
    return true
  }

  async sendData(
    clientId: string,
    _data: DeskThingToDeviceCore & { app?: string }
  ): Promise<boolean> {
    const internalId = this.getInternalId(clientId)
    logger.warn('Unable to send data via ADB! Failed.')
    if (!internalId) return false
    return false
  }

  async broadcastData(_data: DeskThingToDeviceCore & { app?: string }): Promise<void> {
    return
  }

  getStatus(): PlatformStatus {
    return {
      isActive: this.isActive,
      clients: this.clients,
      uptime: this.isActive ? Date.now() - this.startTime : 0
    }
  }
}
