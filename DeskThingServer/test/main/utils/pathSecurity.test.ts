import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertSafePathSegment,
  isSafePathSegment,
  resolvePathWithinRoot
} from '@server/utils/pathSecurity'

describe('path security', () => {
  it('accepts normal app and resource names', () => {
    expect(isSafePathSegment('spotify-plus')).toBe(true)
    expect(isSafePathSegment('@community weather_2.0')).toBe(true)
    expect(() => assertSafePathSegment('album-art.jpg')).not.toThrow()
  })

  it.each(['', '.', '..', '../secret', '..\\secret', 'file:stream', 'bad?.png'])(
    'rejects unsafe single segment %j',
    (segment) => {
      expect(isSafePathSegment(segment)).toBe(false)
      expect(() => assertSafePathSegment(segment)).toThrow()
    }
  )

  it('resolves nested resources only when they remain below the root', () => {
    const root = resolve('test-root', 'apps')

    expect(resolvePathWithinRoot(root, 'spotify', 'server', 'index.js')).toBe(
      resolve(root, 'spotify', 'server', 'index.js')
    )
    expect(resolvePathWithinRoot(root, '..', 'private.json')).toBeNull()
    expect(resolvePathWithinRoot(root, 'spotify', '..', '..', 'private.json')).toBeNull()
  })
})
