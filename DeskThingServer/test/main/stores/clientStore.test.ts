import { ClientManifest } from '@deskthing/types'
import { ReleaseStoreClass } from '@shared/stores/releaseStore'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getClientManifest: vi.fn(),
  updateManifest: vi.fn()
}))

vi.mock('@server/services/client/clientService', () => ({
  downloadAndInstallClient: vi.fn(),
  getClientManifest: mocks.getClientManifest,
  loadClientFromZip: vi.fn(),
  updateManifest: mocks.updateManifest
}))

vi.mock('@server/services/events/progressBus', () => ({
  progressBus: {
    complete: vi.fn(),
    error: vi.fn(),
    startOperation: vi.fn(),
    update: vi.fn(),
    warn: vi.fn()
  }
}))

vi.mock('@server/utils/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}))

import { ClientStore } from '@server/stores/clientStore'

const manifest = {
  id: 'deskthing',
  name: 'DeskThing Client',
  version: '0.11.2'
} as ClientManifest

const releaseStore = {
  on: vi.fn()
} as unknown as ReleaseStoreClass

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ClientStore persistence', () => {
  it('waits for the client manifest write before reporting the save as complete', async () => {
    let completeWrite: (() => void) | undefined
    mocks.updateManifest.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          completeWrite = resolve
        })
    )

    const store = new ClientStore(releaseStore)
    await store.setClient(manifest)

    let saveCompleted = false
    const save = store.saveToFile().then(() => {
      saveCompleted = true
    })

    await Promise.resolve()
    expect(mocks.updateManifest).toHaveBeenCalledWith(manifest)
    expect(saveCompleted).toBe(false)

    completeWrite?.()
    await save
    expect(saveCompleted).toBe(true)
  })
})
