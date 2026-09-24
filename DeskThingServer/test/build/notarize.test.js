import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@electron/notarize', () => ({ notarize: vi.fn() }))
import { notarize } from '@electron/notarize'
import notarizing from '../../build/notarize.js'

const context = {
  electronPlatformName: 'darwin',
  appOutDir: '/tmp/output',
  packager: { appInfo: { productFilename: 'DeskThing' } }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('DESKTHING_SKIP_NOTARIZATION', '')
  vi.stubEnv('APPLE_TEAM_ID', 'test-team')
  vi.stubEnv('APPLE_ID', 'test@example.test')
  vi.stubEnv('APPLE_APP_SPECIFIC_PASSWORD', 'test-password')
})

afterEach(() => vi.unstubAllEnvs())

describe('macOS packaging notarization', () => {
  it('does not notarize other platforms', async () => {
    await notarizing({ ...context, electronPlatformName: 'win32' })
    expect(notarize).not.toHaveBeenCalled()
  })

  it('allows an explicit unsigned validation build', async () => {
    vi.stubEnv('DESKTHING_SKIP_NOTARIZATION', 'true')
    vi.stubEnv('APPLE_ID', '')
    await notarizing(context)
    expect(notarize).not.toHaveBeenCalled()
  })

  it.each(['APPLE_TEAM_ID', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD'])(
    'blocks packaging when %s is missing',
    async (name) => {
      vi.stubEnv(name, ' ')
      await expect(notarizing(context)).rejects.toThrow(name)
      expect(notarize).not.toHaveBeenCalled()
    }
  )

  it('propagates a failed notarization to the packager', async () => {
    notarize.mockRejectedValue(new Error('Service rejected submission'))
    await expect(notarizing(context)).rejects.toThrow('packaging aborted')
  })

  it('waits for successful notarization', async () => {
    notarize.mockResolvedValue(undefined)
    await notarizing(context)
    expect(notarize).toHaveBeenCalledWith(
      expect.objectContaining({
        appPath: '/tmp/output/DeskThing.app',
        teamId: 'test-team'
      })
    )
  })
})
