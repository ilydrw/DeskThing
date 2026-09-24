import { create } from 'zustand'
import {
  ClientDownloadReturnData,
  IpcRendererCallback,
  KnownDevice,
  LoggingData
} from '@shared/types'
import { ClientManifest, Client, PlatformIDs, ConnectionState } from '@deskthing/types'
import useNotificationStore from './notificationStore'

interface ClientStoreState {
  connections: number
  clients: Client[]
  logging: LoggingData | null
  clientManifest: ClientManifest | null
  knownDevices: KnownDevice[]
  initialized: boolean

  // Actions
  initialize: () => Promise<void>
  requestClientManifest: () => Promise<ClientManifest | undefined>
  requestADBDevices: () => Promise<Client[] | undefined>
  requestConnections: () => Promise<void>
  refreshConnections: () => Promise<boolean>
  downloadLatestClient: () => Promise<void>
  /**
   * @deprecated - use release store instead for URLs
   */
  loadClientUrl: (url: string) => Promise<ClientDownloadReturnData>
  loadClientZip: (zip: string) => Promise<ClientDownloadReturnData>
  updateClientManifest: (client: Partial<ClientManifest>) => void
  renameDevice: (clientId: string, displayName?: string) => Promise<KnownDevice | undefined>
  forgetDevice: (clientId: string) => Promise<boolean>
}

// ADB discovery also returns devices whose display client has not connected yet.
const countConnectedClients = (clients: Client[]): number =>
  clients.filter(
    (client) => client.connected && client.connectionState === ConnectionState.Connected
  ).length

export const findKnownDeviceForClient = (
  client: Client,
  knownDevices: KnownDevice[]
): KnownDevice | undefined => {
  const identifiers = new Set<string>([
    client.clientId,
    ...Object.values(client.identifiers ?? {}).map((identifier) => identifier.id)
  ])
  const usid = client.meta?.[PlatformIDs.ADB]?.usid
  if (usid) identifiers.add(usid)

  return knownDevices.find(
    (device) =>
      identifiers.has(device.id) ||
      Object.values(device.identifiers).some(
        (identifier) => Boolean(identifier) && identifiers.has(identifier)
      )
  )
}

const clientsShareIdentity = (left: Client, right: Client): boolean => {
  const leftIdentifiers = new Set([
    left.clientId,
    ...Object.values(left.identifiers ?? {}).map((identifier) => identifier.id),
    left.meta?.[PlatformIDs.ADB]?.usid
  ])
  const rightIdentifiers = [
    right.clientId,
    ...Object.values(right.identifiers ?? {}).map((identifier) => identifier.id),
    right.meta?.[PlatformIDs.ADB]?.usid
  ]

  return rightIdentifiers.some(
    (identifier) => Boolean(identifier) && leftIdentifiers.has(identifier)
  )
}

// Create Zustand store
const useClientStore = create<ClientStoreState>((set, get) => ({
  connections: 0,
  clients: [],
  logging: null,
  clientManifest: null,
  knownDevices: [],
  initialized: false,

  initialize: async () => {
    if (get().initialized) return

    const handleClientData: IpcRendererCallback<'clients'> = (_event, data) => {
      set(() => ({
        clients: data,
        connections: countConnectedClients(data)
      }))
    }

    const handleNewClient: IpcRendererCallback<'platform:client'> = (_event, data) => {
      switch (data.request) {
        case 'added': {
          set((state) => {
            const existingClientIndex = state.clients.findIndex((client) =>
              clientsShareIdentity(client, data.client)
            )

            if (existingClientIndex !== -1) {
              const clients = state.clients.map((client, index) =>
                index === existingClientIndex ? data.client : client
              )
              return {
                clients,
                connections: countConnectedClients(clients)
              }
            }

            const clients = [...state.clients, data.client]
            return {
              clients,
              connections: countConnectedClients(clients)
            }
          })
          break
        }
        case 'removed': {
          set((state) => {
            const clients = state.clients.filter((client) => client.clientId !== data.clientId)
            return { clients, connections: countConnectedClients(clients) }
          })
          break
        }
        case 'modified': {
          set((state) => {
            const existingClientIndex = state.clients.findIndex((client) =>
              clientsShareIdentity(client, data.client)
            )
            if (existingClientIndex === -1) {
              const clients = [...state.clients, data.client]
              return {
                clients,
                connections: countConnectedClients(clients)
              }
            }

            const clients = state.clients.map((client, index) =>
              index === existingClientIndex ? data.client : client
            )
            return {
              clients,
              connections: countConnectedClients(clients)
            }
          })
          break
        }
        case 'list': {
          set({
            clients: data.clients,
            connections: countConnectedClients(data.clients)
          })
          break
        }
      }
    }

    const handleKnownDevices: IpcRendererCallback<'known-devices'> = (_event, devices) => {
      set({ knownDevices: devices })
    }

    window.electron.ipcRenderer.on('clients', handleClientData)
    window.electron.ipcRenderer.on('platform:client', handleNewClient)
    window.electron.ipcRenderer.on('known-devices', handleKnownDevices)

    const [clientManifest, knownDevices] = await Promise.all([
      window.electron.client.getClientManifest(),
      window.electron.client.getKnownDevices()
    ])

    set({ initialized: true, clientManifest, knownDevices })
  },

  downloadLatestClient: async (): Promise<void> => {
    const clientManifest = await window.electron.client.downloadLatestClient()
    if (!clientManifest) {
      return undefined
    } else {
      set({ clientManifest })
    }
  },

  requestClientManifest: async (): Promise<ClientManifest | undefined> => {
    const clientManifest = await window.electron.client.getClientManifest()

    if (!clientManifest) {
      const addIssue = useNotificationStore.getState().addIssue
      addIssue({
        title: 'Client Is Not Installed!',
        description:
          "The client wasn't found! Please install the Client in order to finish setting up the server!",
        id: `client-manifest-missing`,
        status: 'error',
        complete: false,
        steps: [
          {
            task: 'Go to Downloads -> Client Downloads and download the latest client',
            status: false,
            stepId: 'download'
          }
        ]
      })
      return undefined
    } else {
      const removeIssue = useNotificationStore.getState().removeIssue
      removeIssue('client-manifest-missing')
    }

    set({ clientManifest })
    return clientManifest
  },

  updateClientManifest: async (client: Partial<ClientManifest>): Promise<void> => {
    set((state) => ({
      clientManifest: state.clientManifest
        ? { ...state.clientManifest, ...client }
        : (client as ClientManifest)
    }))
    window.electron.client.updateClientManifest(client)
  },

  renameDevice: async (
    clientId: string,
    displayName?: string
  ): Promise<KnownDevice | undefined> => {
    const renamed = await window.electron.client.renameDevice(clientId, displayName)
    if (!renamed) return

    set((state) => ({
      knownDevices: [renamed, ...state.knownDevices.filter((device) => device.id !== renamed.id)]
    }))
    return renamed
  },

  forgetDevice: async (clientId: string): Promise<boolean> => {
    const currentDevice = get().knownDevices.find(
      (device) => device.id === clientId || Object.values(device.identifiers).includes(clientId)
    )
    const forgotten = await window.electron.client.forgetDevice(clientId)
    if (forgotten && currentDevice) {
      set((state) => ({
        knownDevices: state.knownDevices.filter((device) => device.id !== currentDevice.id)
      }))
    }
    return forgotten
  },

  requestADBDevices: async (): Promise<Client[] | undefined> => {
    try {
      const devices = await window.electron.platform.send({
        platform: PlatformIDs.ADB,
        type: 'refresh',
        request: 'adb'
      })

      return devices
    } catch (error) {
      console.error('Error fetching ADB devices:', error)
      return []
    }
  },

  // Request Connections
  requestConnections: async (): Promise<void> => {
    try {
      const connections = await window.electron.utility.getConnections()
      console.debug('Got the connections', connections)
      set({
        connections: countConnectedClients(connections),
        clients: connections
      })
    } catch (error) {
      console.error('Error fetching connections:', error)
    }
  },

  refreshConnections: async (): Promise<boolean> => {
    try {
      const clients = await window.electron.platform.refreshConnections()
      console.debug('Got the connections', clients)
      if (!clients) return false
      set(() => ({
        clients: clients,
        connections: countConnectedClients(clients)
      }))
      return true
    } catch (error) {
      console.error('Error fetching connections:', error)
      return false
    }
  },

  loadClientUrl: async (url: string): Promise<ClientDownloadReturnData> => {
    const result = await window.electron.client.handleClientURL(url)

    if (result.success) {
      set({ clientManifest: result.clientManifest })
    }

    return result
  },

  loadClientZip: async (zip: string): Promise<ClientDownloadReturnData> => {
    const result = await window.electron.client.handleClientZip(zip)

    if (result.success) {
      set({ clientManifest: result.clientManifest })
    }

    return result
  }
}))
export default useClientStore
