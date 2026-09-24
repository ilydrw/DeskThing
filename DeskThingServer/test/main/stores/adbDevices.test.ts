import { describe, expect, it } from 'vitest'
import { parseAdbDevices } from '@server/stores/platforms/superbird/adbDevices'

describe('parseAdbDevices', () => {
  it('returns only devices that are ready for commands', () => {
    const output = [
      '* daemon not running; starting now at tcp:5037',
      '* daemon started successfully',
      'List of devices attached',
      '8550X0000001   device usb:1-1 product:superbird model:Superbird device:superbird transport_id:1',
      '8550X0000002   unauthorized usb:1-2 transport_id:2',
      '8550X0000003   offline usb:1-3 transport_id:3',
      'emulator-5554  device product:sdk model:sdk device:generic transport_id:4',
      ''
    ].join('\r\n')

    expect(parseAdbDevices(output)).toEqual(['8550X0000001', 'emulator-5554'])
  })

  it('returns an empty list when nothing is attached', () => {
    expect(parseAdbDevices('List of devices attached\n\n')).toEqual([])
  })
})
