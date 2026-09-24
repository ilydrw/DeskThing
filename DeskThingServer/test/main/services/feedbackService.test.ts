import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FeedbackService } from '@server/services/feedbackService'
import type { FeedbackReport, SystemInfo } from '@shared/types'

const mocks = vi.hoisted(() => ({
  getServiceConfig: vi.fn()
}))

vi.mock('@server/config/serviceConfig', () => ({
  getServiceConfig: mocks.getServiceConfig
}))

vi.mock('@server/utils/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    getLogs: vi.fn()
  }
}))

describe('FeedbackService', () => {
  const featureReport: FeedbackReport = {
    type: 'feature',
    feedback: {
      title: 'Feature request',
      feedback: 'Please add this feature'
    }
  }

  beforeEach(() => {
    mocks.getServiceConfig.mockReturnValue({
      statsUrl: null,
      feedbackUrl: null,
      supporterToken: null
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        statusText: 'No Content'
      })
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('does not gather system information when feedback is not configured', async () => {
    const collectSystemInfo = vi.spyOn(FeedbackService, 'collectSystemInfo')

    const result = await FeedbackService.sendFeedback(featureReport)

    expect(result.success).toBe(false)
    expect(collectSystemInfo).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not attach diagnostics to feature feedback', async () => {
    mocks.getServiceConfig.mockReturnValue({
      statsUrl: null,
      feedbackUrl: 'https://feedback.example.test',
      supporterToken: null
    })
    const collectSystemInfo = vi.spyOn(FeedbackService, 'collectSystemInfo')

    const result = await FeedbackService.sendFeedback(featureReport)

    expect(result.success).toBe(true)
    expect(collectSystemInfo).not.toHaveBeenCalled()

    const request = vi.mocked(fetch).mock.calls[0][1]
    const payload = JSON.parse(request?.body as string)
    const fieldNames = payload.embeds[0].fields.map((field: { name: string }) => field.name)

    expect(fieldNames).not.toContain('System Information')
    expect(fieldNames).not.toContain('Recent Logs')
  })

  it('collects diagnostics once for a bug report', async () => {
    mocks.getServiceConfig.mockReturnValue({
      statsUrl: null,
      feedbackUrl: 'https://feedback.example.test',
      supporterToken: null
    })
    const systemInfo: SystemInfo = {
      serverVersion: 'v0.11.17',
      clientVersion: '1.0.0',
      os: 'test-os',
      cpu: 'test-cpu',
      ram: '8 GB',
      freeRam: '4 GB',
      arch: 'x64',
      loadAverage: [0, 0, 0],
      uptime: 60,
      apps: [],
      clients: [],
      recentLogs: ['test log']
    }
    const collectSystemInfo = vi
      .spyOn(FeedbackService, 'collectSystemInfo')
      .mockResolvedValue(systemInfo)
    const bugReport: FeedbackReport = {
      type: 'bug',
      feedback: {
        title: 'Bug report',
        feedback: 'Something failed'
      }
    }

    const result = await FeedbackService.sendFeedback(bugReport)

    expect(result.success).toBe(true)
    expect(collectSystemInfo).toHaveBeenCalledOnce()

    const request = vi.mocked(fetch).mock.calls[0][1]
    const payload = JSON.parse(request?.body as string)
    const fieldNames = payload.embeds[0].fields.map((field: { name: string }) => field.name)

    expect(fieldNames).toContain('System Information')
    expect(fieldNames).toContain('Recent Logs')
  })
})
