import { describe, expect, it, vi } from 'vitest'
import { createBeforeQuitHandler } from '@server/lifecycle/shutdownHandler'

const flushPromises = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('application shutdown persistence', () => {
  it('blocks quit synchronously, persists once, then allows the guarded quit', async () => {
    let finishPersistence: (() => void) | undefined
    const persistBeforeQuit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishPersistence = resolve
        })
    )
    const quit = vi.fn()
    const reportError = vi.fn()
    const handler = createBeforeQuitHandler(persistBeforeQuit, quit, reportError)
    const firstEvent = { preventDefault: vi.fn() }
    const repeatedEvent = { preventDefault: vi.fn() }

    handler(firstEvent)
    handler(repeatedEvent)

    expect(firstEvent.preventDefault).toHaveBeenCalledOnce()
    expect(repeatedEvent.preventDefault).toHaveBeenCalledOnce()
    expect(persistBeforeQuit).toHaveBeenCalledOnce()
    expect(quit).not.toHaveBeenCalled()

    finishPersistence?.()
    await flushPromises()

    expect(quit).toHaveBeenCalledOnce()
    expect(reportError).not.toHaveBeenCalled()

    const finalEvent = { preventDefault: vi.fn() }
    handler(finalEvent)
    expect(finalEvent.preventDefault).not.toHaveBeenCalled()
  })

  it('allows the app to quit after reporting a persistence failure', async () => {
    const error = new Error('save failed')
    const quit = vi.fn()
    const reportError = vi.fn()
    const handler = createBeforeQuitHandler(() => Promise.reject(error), quit, reportError)
    const event = { preventDefault: vi.fn() }

    handler(event)
    await flushPromises()

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(reportError).toHaveBeenCalledWith(error)
    expect(quit).toHaveBeenCalledOnce()
  })
})
