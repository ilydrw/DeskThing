type BeforeQuitEvent = {
  preventDefault(): void
}

export function createBeforeQuitHandler(
  persistBeforeQuit: () => Promise<void>,
  quit: () => void,
  reportError: (error: unknown) => void = (error) =>
    console.error('Failed to persist application state before quitting', error)
): (event: BeforeQuitEvent) => void {
  let shutdownComplete = false
  let shutdownInProgress: Promise<void> | null = null

  return (event) => {
    if (shutdownComplete) return

    event.preventDefault()
    if (shutdownInProgress) return

    shutdownInProgress = persistBeforeQuit()
      .catch(reportError)
      .finally(() => {
        shutdownComplete = true
        quit()
      })
  }
}
