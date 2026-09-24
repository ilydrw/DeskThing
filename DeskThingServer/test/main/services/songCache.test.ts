import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SongData } from '@deskthing/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SongCache, SongCacheEvents } from '@server/services/music/songCache'

const mocks = vi.hoisted(() => ({
  userDataPath: ''
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => mocks.userDataPath)
  }
}))

vi.mock('@server/utils/logger', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn()
  }
}))

const tempDirectories: string[] = []

const createSong = (overrides: Partial<SongData> = {}): SongData =>
  ({
    version: 1,
    id: 'track-1',
    track_name: 'Test Track',
    artist: 'Test Artist',
    album: 'Test Album',
    is_playing: false,
    track_duration: 180_000,
    track_progress: 0,
    ...overrides
  }) as SongData

beforeEach(async () => {
  mocks.userDataPath = await mkdtemp(join(tmpdir(), 'deskthing-song-cache-'))
  tempDirectories.push(mocks.userDataPath)
})

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe('SongCache', () => {
  it('emits the normalized cached song rather than the legacy input object', () => {
    const cache = new SongCache()
    const listener = vi.fn()
    cache.on(SongCacheEvents.SONG_CHANGED, listener)

    cache.updateSong(createSong())

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(cache.getCurrentSong())
    expect(listener.mock.calls[0][0]).toMatchObject({
      version: 2,
      source: 'unknown'
    })
  })

  it('replaces base64 artwork with one bounded local resource reference', async () => {
    const cache = new SongCache()
    const listener = vi.fn()
    cache.on(SongCacheEvents.SONG_CHANGED, listener)

    cache.updateSong(
      createSong({
        thumbnail: `data:image/jpeg;base64,${Buffer.from('thumbnail').toString('base64')}`
      })
    )

    expect(listener).toHaveBeenCalledTimes(1)
    const emittedSong = listener.mock.calls[0][0] as SongData
    expect(emittedSong.thumbnail).toMatch(/^\/resource\/thumbnail\/[a-f0-9]{64}$/)

    const files = await readdir(join(mocks.userDataPath, 'thumbnails'))
    expect(files).toEqual([`${emittedSong.thumbnail?.split('/').at(-1)}.jpg`])
  })
})
