import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import useUpdateStore from '@renderer/stores/updateStore'

const download = vi.fn()
const install = vi.fn()
const check = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  useUpdateStore.setState(useUpdateStore.getInitialState(), true)
  vi.stubGlobal('window', { electron: { update: { download, install, check } } })
})
afterEach(() => vi.unstubAllGlobals())

describe('update request lifecycle', () => {
  it.each(['downloadUpdate', 'quitAndInstall'] as const)(
    'waits for %s to finish',
    async (action) => {
      let finish: () => void = () => {}
      const pending = new Promise<void>((resolve) => {
        finish = resolve
      })
      const command = action === 'downloadUpdate' ? download : install
      command.mockReturnValue(pending)
      let complete = false
      const request = useUpdateStore
        .getState()
        [action]()
        .then(() => {
          complete = true
        })
      await Promise.resolve()
      expect(complete).toBe(false)
      expect(command).toHaveBeenCalledOnce()
      finish()
      await request
      expect(complete).toBe(true)
    }
  )

  it.each(['downloadUpdate', 'quitAndInstall'] as const)(
    'reports rejected %s requests without losing release details',
    async (action) => {
      const command = action === 'downloadUpdate' ? download : install
      command.mockRejectedValue(new Error('Desktop service unavailable'))
      await useUpdateStore.getState().updateStatus({
        updateAvailable: true,
        updateDownloaded: action === 'quitAndInstall',
        version: '1.1.0'
      })
      await useUpdateStore.getState()[action]()
      expect(useUpdateStore.getState().update).toMatchObject({
        failed: true,
        error: 'Desktop service unavailable',
        version: '1.1.0'
      })
    }
  )

  it('returns a failed check message and exposes it to the update panel', async () => {
    check.mockRejectedValue(new Error('Could not reach desktop service'))
    await expect(useUpdateStore.getState().checkForUpdates()).resolves.toBe(
      'Could not reach desktop service'
    )
    expect(useUpdateStore.getState().update.failed).toBe(true)
  })
})
