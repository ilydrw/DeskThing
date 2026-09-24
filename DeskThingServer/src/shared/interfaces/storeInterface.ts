export interface StoreInterface {
  readonly autoInit?: boolean
  initialize(): Promise<void>
  initialized: boolean
  dispose?(): void | Promise<void>
}
