import { Client } from '@deskthing/types'
import { StoreInterface } from '@shared/interfaces/storeInterface'
import { CacheableStore, KnownDevice } from '@shared/types'
import EventEmitter from 'node:events'

export const DEVICE_REGISTRY_UPDATED = 'devices-updated' as const

export type DeviceRegistryStoreEvents = {
  [DEVICE_REGISTRY_UPDATED]: [KnownDevice[]]
}

export interface DeviceRegistryStoreClass
  extends CacheableStore,
    EventEmitter<DeviceRegistryStoreEvents>,
    StoreInterface {
  getDevices(): KnownDevice[]
  getDevice(deviceId: string): KnownDevice | undefined
  registerClient(client: Client): KnownDevice
  renameDevice(deviceId: string, displayName?: string): Promise<KnownDevice | undefined>
  forgetDevice(deviceId: string): Promise<boolean>
}
