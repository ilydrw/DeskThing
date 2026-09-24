import { PlatformIDs } from '@deskthing/types'

export type KnownDeviceIdentifier = PlatformIDs | 'client' | 'usid'

export type KnownDevice = {
  /** Stable identifier owned by the DeskThing server. */
  id: string
  /** Optional user-provided name. */
  displayName?: string
  /** Durable identifiers observed across connection providers. */
  identifiers: Partial<Record<KnownDeviceIdentifier, string>>
  firstSeenAt: number
  lastSeenAt: number
}

export type KnownDeviceFile = {
  version: 1
  devices: KnownDevice[]
}
