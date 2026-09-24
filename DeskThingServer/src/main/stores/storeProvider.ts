// Store Classes
import { AppDataStoreClass } from '@shared/stores/appDataStore'
import { AppStoreClass } from '@shared/stores/appStore'
import { ReleaseStoreClass } from '@shared/stores/releaseStore'
import { MappingStoreClass } from '@shared/stores/mappingStore'
import { MusicStoreClass } from '@shared/stores/musicStore'
import { SettingsStoreClass } from '@shared/stores/settingsStore'
import { AppProcessStoreClass } from '@shared/stores/appProcessStore'
import { TaskStoreClass } from '@shared/stores/taskStore'
import { PlatformStoreClass } from '@shared/stores/platformStore'
import { AuthStoreClass } from '@shared/stores/authStore'
import { ClientStoreClass } from '@shared/stores/clientStore'
import { UpdateStoreClass } from '@shared/stores/updateStore'
import { ProfileStoreClass } from '@shared/stores/profileStore'
import { SupporterStoreClass } from '@shared/stores/supporterStore'
import { AutoLaunchStoreClass } from '@shared/stores/autoLaunchStore'
import { GithubStoreClass } from '@shared/stores/githubStore'
import { StatsStoreClass } from '@shared/stores/statsStore'

// Stores

// import { ExpressServerStoreClass } from '@shared/stores/expressServerStore'
// import { ExpressServerManager } from './_expressServerStore'
import logger from '@server/utils/logger'
import { ServerTaskStoreClass } from '@shared/stores/serverTaskStore'
import { FlashStoreClass } from '@shared/stores/flashStore'
import { ThingifyStoreClass } from '@shared/stores/thingifyStore'
import { StatsCollector } from './statsCollectionStore'
import { NotificationStoreClass } from '@shared/stores/notificationStore'
import { TimeStoreClass } from '@shared/stores/timeStoreClass'
import { DeviceRegistryStoreClass } from '@shared/stores/deviceRegistryStore'

interface Stores {
  appDataStore: AppDataStoreClass
  appProcessStore: AppProcessStoreClass
  appStore: AppStoreClass
  authStore: AuthStoreClass
  clientStore: ClientStoreClass
  releaseStore: ReleaseStoreClass
  mappingStore: MappingStoreClass
  musicStore: MusicStoreClass
  platformStore: PlatformStoreClass
  profileStore: ProfileStoreClass
  settingsStore: SettingsStoreClass
  taskStore: TaskStoreClass
  updateStore: UpdateStoreClass
  supporterStore: SupporterStoreClass
  autoLaunchStore: AutoLaunchStoreClass
  githubStore: GithubStoreClass
  serverTaskStore: ServerTaskStoreClass
  flashStore: FlashStoreClass
  thingifyStore: ThingifyStoreClass
  statsStore: StatsStoreClass
  statsCollector: StatsCollector
  timeStore: TimeStoreClass
  notificationStore: NotificationStoreClass
  deviceRegistryStore: DeviceRegistryStoreClass
}

export class StoreProvider {
  private static instance: StoreProvider
  private storeInstances: {
    [K in keyof Stores]?: Stores[K]
  } = {}
  private storeInitializers: {
    [K in keyof Stores]: () => Promise<Stores[K]>
  }
  private initialized = false
  private initialization?: Promise<void>
  private constructing = new Map<keyof Stores, Promise<void>>()
  private initializing = new Map<keyof Stores, Promise<void>>()

  private constructor() {
    const storeImports = {
      appDataStore: () => import('./appDataStore').then((m) => m.AppDataStore),
      notificationStore: () => import('./notificationStore').then((m) => m.NotificationStore),
      deviceRegistryStore: () => import('./deviceRegistryStore').then((m) => m.DeviceRegistryStore),
      appStore: () => import('./appStore').then((m) => m.AppStore),
      authStore: () => import('./authStore').then((m) => m.AuthStore),
      releaseStore: () => import('./releaseStore').then((m) => m.ReleaseStore),
      mappingStore: () => import('./mappingStore').then((m) => m.MappingStore),
      musicStore: () => import('./musicStore').then((m) => m.MusicStore),
      profileStore: () => import('./profileStore').then((m) => m.ProfileStore),
      settingsStore: () => import('./settingsStore').then((m) => m.SettingsStore),
      taskStore: () => import('./taskStore').then((m) => m.TaskStore),
      appProcessStore: () => import('./appProcessStore').then((m) => m.AppProcessStore),
      platformStore: () => import('./platformStore').then((m) => m.PlatformStore),
      clientStore: () => import('./clientStore').then((m) => m.ClientStore),
      updateStore: () => import('./updateStore').then((m) => m.UpdateStore),
      supporterStore: () => import('./supporterStore').then((m) => m.SupporterStore),
      autoLaunchStore: () => import('./autoLaunchStore').then((m) => m.AutoLaunchStore),
      githubStore: () => import('./githubStore').then((m) => m.GithubStore),
      serverTaskStore: () => import('./serverTaskStore').then((m) => m.ServerTaskStore),
      flashStore: () => import('./flashStore').then((m) => m.FlashStore),
      thingifyStore: () => import('./thingifyStore').then((m) => m.ThingifyStore),
      statsStore: () => import('./statsStore').then((m) => m.StatsStore),
      timeStore: () => import('./timeStore').then((m) => m.TimeStore),
      statsCollector: () => StatsCollector
    }

    this.storeInitializers = {
      settingsStore: async () => new (await storeImports.settingsStore())(),
      appProcessStore: async () => new (await storeImports.appProcessStore())(),
      authStore: async () =>
        new (await storeImports.authStore())(await this.getStore('settingsStore', false)),
      releaseStore: async () => new (await storeImports.releaseStore())(),
      notificationStore: async () => new (await storeImports.notificationStore())(),
      deviceRegistryStore: async () => new (await storeImports.deviceRegistryStore())(),
      appStore: async () =>
        new (await storeImports.appStore())(
          await this.getStore('appProcessStore', false),
          await this.getStore('authStore', false),
          await this.getStore('releaseStore', false),
          await this.getStore('notificationStore', false)
        ),
      appDataStore: async () =>
        new (await storeImports.appDataStore())(await this.getStore('appStore', false)),
      platformStore: async () =>
        new (await storeImports.platformStore())(
          await this.getStore('appStore', false),
          await this.getStore('appDataStore', false),
          await this.getStore('mappingStore', false),
          await this.getStore('deviceRegistryStore', false)
        ),
      taskStore: async () =>
        new (await storeImports.taskStore())(
          await this.getStore('appDataStore', false),
          await this.getStore('appStore', false)
        ),
      mappingStore: async () =>
        new (await storeImports.mappingStore())(await this.getStore('appStore', false)),
      musicStore: async () =>
        new (await storeImports.musicStore())(
          await this.getStore('settingsStore', false),
          await this.getStore('appStore', false),
          await this.getStore('platformStore', false)
        ),
      clientStore: async () =>
        new (await storeImports.clientStore())(await this.getStore('releaseStore', false)),
      profileStore: async () =>
        new (await storeImports.profileStore())(await this.getStore('platformStore', false)),
      updateStore: async () => new (await storeImports.updateStore())(),
      supporterStore: async () => new (await storeImports.supporterStore())(),
      autoLaunchStore: async () =>
        new (await storeImports.autoLaunchStore())(await this.getStore('settingsStore', false)),
      githubStore: async () => new (await storeImports.githubStore())(),
      serverTaskStore: async () =>
        new (await storeImports.serverTaskStore())(
          await this.getStore('taskStore', false),
          await this.getStore('clientStore', false),
          await this.getStore('platformStore', false)
        ),
      flashStore: async () => new (await storeImports.flashStore())(),
      thingifyStore: async () => new (await storeImports.thingifyStore())(),
      statsStore: async () =>
        new (await storeImports.statsStore())(await this.getStore('settingsStore', false)),
      timeStore: async () =>
        new (await storeImports.timeStore())(await this.getStore('platformStore', false)),
      statsCollector: async () =>
        new (await storeImports.statsCollector())(
          await this.getStore('statsStore', false),
          await this.getStore('settingsStore', false)
        )
    }

    void this.initialize().catch((error) => {
      logger.error('Unable to initialize settings for logging', {
        source: 'storeProvider', function: 'initialize', error: error as Error
      })
    })
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return
    this.initialization ??= this.getStore('settingsStore').then(async (settingStore) => {
      await logger.setupSettingsListener(settingStore)
      this.initialized = true
    }).finally(() => { this.initialization = undefined })
    await this.initialization
  }

  public static getInstance(): StoreProvider {
    if (!StoreProvider.instance) {
      StoreProvider.instance = new StoreProvider()
    }
    return StoreProvider.instance
  }

  public async getStore<K extends keyof Stores>(
    storeName: K,
    initialize = true
  ): Promise<Stores[K]> {
    let store = this.storeInstances[storeName]
    if (!store) {
      let constructing = this.constructing.get(storeName)
      if (!constructing) {
        constructing = this.storeInitializers[storeName]().then(async (created) => {
        // Wire the back-reference only once the task store's dependencies exist.
        if (storeName === 'taskStore') {
          const appDataStore = await this.getStore('appDataStore', false)
          await appDataStore.setupListeners(created as Stores['taskStore'])
        }
        this.storeInstances[storeName] = created
        }).finally(() => { this.constructing.delete(storeName) })
        this.constructing.set(storeName, constructing)
      }
      await constructing
      store = this.storeInstances[storeName]
    }
    if (!store) throw new Error(`Store construction did not produce ${storeName}`)

    if (initialize) {
      let initializing = this.initializing.get(storeName)
      if (!initializing && !store.initialized) {
        const instance = store
        initializing = Promise.resolve().then(() => instance.initialize()).finally(() => {
          this.initializing.delete(storeName)
        })
        this.initializing.set(storeName, initializing)
      }
      if (initializing) await initializing
    }
    return store
  }

  public async clearAllCaches(): Promise<void> {
    await Promise.all(
      Object.values(this.storeInstances).map((store) =>
        'clearCache' in store ? store.clearCache() : Promise.resolve()
      )
    )
  }

  public async collectShutdownStats(): Promise<void> {
    await this.storeInstances.statsCollector?.collectSessionCloseStats()
  }

  public async dispose(): Promise<void> {
    const results = await Promise.allSettled(Object.values(this.storeInstances).map(async (store) => {
      await store.dispose?.()
    }))
    const failures = results.filter((result) => result.status === 'rejected')
    if (failures.length) throw new AggregateError(failures.map((result) => result.reason), 'Service cleanup failed')
  }

  public async saveAllToFile(): Promise<void> {
    await Promise.all(
      Object.values(this.storeInstances).map((store) =>
        'saveToFile' in store ? store.saveToFile() : Promise.resolve()
      )
    )
  }
}

export const storeProvider = StoreProvider.getInstance()
