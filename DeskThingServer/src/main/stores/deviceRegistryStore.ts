import { randomUUID } from 'node:crypto'
import EventEmitter from 'node:events'
import { Client, PlatformIDs } from '@deskthing/types'
import {
  DEVICE_REGISTRY_UPDATED,
  DeviceRegistryStoreClass,
  DeviceRegistryStoreEvents
} from '@shared/stores/deviceRegistryStore'
import { KnownDevice, KnownDeviceFile, KnownDeviceIdentifier } from '@shared/types'
import { readFromFile, writeToFile } from '@server/services/files/fileService'
import logger from '@server/utils/logger'
import { isRecord } from '@shared/validation/settings'

const DEVICE_REGISTRY_FILE = 'devices/known-devices.json'
const DEVICE_REGISTRY_VERSION = 1 as const
const LAST_SEEN_PERSIST_INTERVAL_MS = 5 * 60 * 1000
const MAX_DEVICE_NAME_LENGTH = 64

const validateRegistryFile = (value: unknown): void => {
  if (!isRecord(value) || value.version !== DEVICE_REGISTRY_VERSION || !Array.isArray(value.devices)) {
    throw new Error('Unsupported or invalid known-device registry')
  }
}

export class DeviceRegistryStore
  extends EventEmitter<DeviceRegistryStoreEvents>
  implements DeviceRegistryStoreClass
{
  private devices = new Map<string, KnownDevice>()
  private identifierIndex = new Map<string, string>()
  private _initialized = false
  private initialization?: Promise<void>
  private lastPersistedSeen = new Map<string, number>()

  public get initialized(): boolean {
    return this._initialized
  }

  async initialize(): Promise<void> {
    if (this._initialized) return
    this.initialization ??= this.loadDevices().finally(() => { this.initialization = undefined })
    await this.initialization
  }

  private async loadDevices(): Promise<void> {
    let stored: KnownDeviceFile | undefined
    try {
      stored = await readFromFile<KnownDeviceFile>(DEVICE_REGISTRY_FILE, validateRegistryFile)
    } catch (error) {
      logger.error('Unable to read known devices; retaining the original file and using an empty registry for this session', {
        source: 'deviceRegistryStore', function: 'initialize', error: error as Error
      })
    }
    if (stored?.version === DEVICE_REGISTRY_VERSION && Array.isArray(stored.devices)) {
      for (const device of stored.devices) {
        const validated = this.validateStoredDevice(device)
        if (validated) {
          this.devices.set(validated.id, validated)
          this.lastPersistedSeen.set(validated.id, validated.lastSeenAt)
        }
      }
    }

    this.rebuildIdentifierIndex()
    this._initialized = true
  }

  clearCache = async (): Promise<void> => {
    // Known devices are small and participate in synchronous connection reconciliation.
  }

  saveToFile = async (): Promise<void> => {
    const data: KnownDeviceFile = {
      version: DEVICE_REGISTRY_VERSION,
      devices: this.getDevices()
    }
    await writeToFile(data, DEVICE_REGISTRY_FILE)
    this.lastPersistedSeen = new Map(data.devices.map((device) => [device.id, device.lastSeenAt]))
  }

  getDevices(): KnownDevice[] {
    return Array.from(this.devices.values())
      .map((device) => ({ ...device, identifiers: { ...device.identifiers } }))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
  }

  getDevice(deviceId: string): KnownDevice | undefined {
    const canonicalId = this.devices.has(deviceId) ? deviceId : this.identifierIndex.get(deviceId)
    if (!canonicalId) return

    const device = this.devices.get(canonicalId)
    return device ? { ...device, identifiers: { ...device.identifiers } } : undefined
  }

  registerClient(client: Client): KnownDevice {
    const now = Date.now()
    const identifiers = this.getClientIdentifiers(client)
    const matchingIds = new Set<string>()

    for (const identifier of Object.values(identifiers)) {
      if (!identifier) continue
      const matchedId = this.identifierIndex.get(identifier)
      if (matchedId) matchingIds.add(matchedId)
    }

    const matchingDevices = Array.from(matchingIds)
      .map((id) => this.devices.get(id))
      .filter((device): device is KnownDevice => Boolean(device))
      .sort((a, b) => a.firstSeenAt - b.firstSeenAt)

    const primary = matchingDevices[0]
    const device: KnownDevice = primary
      ? { ...primary, identifiers: { ...primary.identifiers } }
      : {
          id: randomUUID(),
          identifiers: {},
          firstSeenAt: now,
          lastSeenAt: now
        }

    let shouldPersist = !primary

    for (const duplicate of matchingDevices.slice(1)) {
      device.identifiers = { ...duplicate.identifiers, ...device.identifiers }
      device.displayName ||= duplicate.displayName
      device.firstSeenAt = Math.min(device.firstSeenAt, duplicate.firstSeenAt)
      device.lastSeenAt = Math.max(device.lastSeenAt, duplicate.lastSeenAt)
      this.devices.delete(duplicate.id)
      shouldPersist = true
    }

    for (const [kind, identifier] of Object.entries(identifiers)) {
      if (!identifier) continue
      const key = kind as KnownDeviceIdentifier
      if (device.identifiers[key] !== identifier) {
        device.identifiers[key] = identifier
        shouldPersist = true
      }
    }

    if (now - (this.lastPersistedSeen.get(device.id) ?? 0) >= LAST_SEEN_PERSIST_INTERVAL_MS) shouldPersist = true
    device.lastSeenAt = now

    this.devices.set(device.id, device)
    this.rebuildIdentifierIndex()

    if (shouldPersist) {
      void this.saveToFile().catch((error) => {
        logger.error('Failed to persist known device registry', {
          source: 'deviceRegistryStore',
          function: 'registerClient',
          error: error as Error
        })
      })
      this.emitDevicesUpdated()
    }

    return { ...device, identifiers: { ...device.identifiers } }
  }

  async renameDevice(deviceId: string, displayName?: string): Promise<KnownDevice | undefined> {
    const device = this.findMutableDevice(deviceId)
    if (!device) return

    const sanitizedName = this.sanitizeDisplayName(displayName)
    if (device.displayName === sanitizedName) return this.getDevice(device.id)

    device.displayName = sanitizedName
    await this.saveToFile()
    this.emitDevicesUpdated()
    return this.getDevice(device.id)
  }

  async forgetDevice(deviceId: string): Promise<boolean> {
    const device = this.findMutableDevice(deviceId)
    if (!device) return false

    this.devices.delete(device.id)
    this.rebuildIdentifierIndex()
    await this.saveToFile()
    this.emitDevicesUpdated()
    return true
  }

  private findMutableDevice(deviceId: string): KnownDevice | undefined {
    if (this.devices.has(deviceId)) return this.devices.get(deviceId)
    const canonicalId = this.identifierIndex.get(deviceId)
    return canonicalId ? this.devices.get(canonicalId) : undefined
  }

  private getClientIdentifiers(client: Client): KnownDevice['identifiers'] {
    const identifiers: KnownDevice['identifiers'] = {
      client: client.clientId
    }

    for (const [platformId, identifier] of Object.entries(client.identifiers ?? {})) {
      if (identifier?.id && Object.values(PlatformIDs).includes(platformId as PlatformIDs)) {
        identifiers[platformId as PlatformIDs] = identifier.id
      }
    }

    const usid = client.meta?.[PlatformIDs.ADB]?.usid?.trim()
    if (usid) identifiers.usid = usid

    return identifiers
  }

  private rebuildIdentifierIndex(): void {
    this.identifierIndex.clear()
    for (const device of this.devices.values()) {
      this.identifierIndex.set(device.id, device.id)
      for (const identifier of Object.values(device.identifiers)) {
        if (identifier) this.identifierIndex.set(identifier, device.id)
      }
    }
  }

  private emitDevicesUpdated(): void {
    this.emit(DEVICE_REGISTRY_UPDATED, this.getDevices())
  }

  private sanitizeDisplayName(displayName: unknown): string | undefined {
    const sanitized = typeof displayName === 'string'
      ? Array.from(displayName)
          .filter((character) => {
            const codePoint = character.codePointAt(0) ?? 0
            return codePoint >= 32 && codePoint !== 127
          })
          .join('')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, MAX_DEVICE_NAME_LENGTH)
      : undefined

    return sanitized || undefined
  }

  private validateStoredDevice(device: unknown): KnownDevice | undefined {
    if (
      !isRecord(device) ||
      typeof device.id !== 'string' || !device.id.trim() ||
      typeof device.firstSeenAt !== 'number' ||
      typeof device.lastSeenAt !== 'number' ||
      !Number.isFinite(device.firstSeenAt) || device.firstSeenAt < 0 ||
      !Number.isFinite(device.lastSeenAt) || device.lastSeenAt < device.firstSeenAt ||
      !isRecord(device.identifiers)
    ) {
      return
    }

    const identifiers: KnownDevice['identifiers'] = {}
    for (const [kind, identifier] of Object.entries(device.identifiers)) {
      if (typeof identifier !== 'string' || !identifier.trim()) continue
      if (![...Object.values(PlatformIDs), 'client', 'usid'].includes(kind)) continue
      identifiers[kind as KnownDeviceIdentifier] = identifier
    }

    return {
      id: device.id,
      displayName: this.sanitizeDisplayName(device.displayName),
      identifiers,
      firstSeenAt: device.firstSeenAt,
      lastSeenAt: device.lastSeenAt
    }
  }
}
