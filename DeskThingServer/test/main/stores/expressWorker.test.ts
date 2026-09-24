import { describe, expect, it } from 'vitest'
import {
  DEVICE_ID_COOKIE,
  getDeviceIdFromCookie
} from '@server/stores/platforms/websocket/expressWorker'

describe('Express device identity cookie', () => {
  it('returns a durable UUID from a mixed cookie header', () => {
    const deviceId = '5f3e13bb-121b-4c99-8aa5-8ebcb654e263'

    expect(getDeviceIdFromCookie(`theme=dark; ${DEVICE_ID_COOKIE}=${deviceId}; mode=full`)).toBe(
      deviceId
    )
  })

  it('rejects malformed device identifiers', () => {
    expect(getDeviceIdFromCookie(`${DEVICE_ID_COOKIE}=not-a-device-id`)).toBeUndefined()
  })
})
