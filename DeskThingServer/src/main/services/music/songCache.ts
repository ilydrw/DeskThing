import { EventEmitter } from 'events'
import { SongAbilities, SongData } from '@deskthing/types'
import Logger from '@server/utils/logger'
import { join } from 'path'
import { app } from 'electron'
import { copyFileSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const MAX_THUMBNAIL_BYTES = 5 * 1024 * 1024
const MAX_THUMBNAIL_CACHE_BYTES = 50 * 1024 * 1024
const MAX_THUMBNAIL_CACHE_FILES = 100

export enum SongCacheEvents {
  SONG_CHANGED = 'songChanged',
  SONG_ENDED = 'songEnded'
}

type SongCacheEventMap = {
  [SongCacheEvents.SONG_CHANGED]: [SongData]
  [SongCacheEvents.SONG_ENDED]: [void]
}

/**
 * Manages the caching of song data and emits events when songs change or end
 */
export class SongCache extends EventEmitter<SongCacheEventMap> {
  private currentSong: SongData | null = null
  private songEndTimeout: NodeJS.Timeout | null = null
  private progressInterval: NodeJS.Timeout | null = null

  constructor() {
    super()
  }

  /**
   * Returns the currently cached song
   */
  public getCurrentSong(): SongData | null {
    return this.currentSong
  }

  /**
   * Updates the cached song data and emits events if the song has changed
   */
  public updateSong(newSong: SongData): void {
    // If no current song, just set it and emit change
    if (!this.currentSong) {
      this.setNewSong(newSong)
      return
    }

    // Check if song has actually changed
    const hasSongChanged =
      this.currentSong.track_name !== newSong.track_name ||
      this.currentSong.artist !== newSong.artist ||
      this.currentSong.album !== newSong.album ||
      this.currentSong.is_playing !== newSong.is_playing ||
      this.currentSong.track_progress !== newSong.track_progress ||
      this.currentSong.track_duration !== newSong.track_duration

    if (hasSongChanged) {
      this.setNewSong(newSong)
    } else {
      // Update progress/state without emitting change
      this.currentSong = {
        ...this.currentSong,
        track_progress: newSong.track_progress,
        track_duration: newSong.track_duration,
        is_playing: newSong.is_playing
      }
    }
  }

  /**
   * Clears the song cache and cancels any pending timeouts
   */
  public clear(): void {
    this.currentSong = null
    if (this.songEndTimeout) {
      clearTimeout(this.songEndTimeout)
      this.songEndTimeout = null
    }
    if (this.progressInterval) {
      clearInterval(this.progressInterval)
      this.progressInterval = null
    }
  }

  private createThumbnailId(song: SongData): string {
    const identity = song.id || `${song.track_name}-${song.artist}-${song.album || ''}`
    return createHash('sha256').update(identity).digest('hex')
  }

  private pruneThumbnailCache(thumbnailsDir: string): void {
    const files = readdirSync(thumbnailsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.jpg'))
      .map((entry) => {
        const filePath = join(thumbnailsDir, entry.name)
        const fileStats = statSync(filePath)
        return {
          path: filePath,
          size: fileStats.size,
          modifiedAt: fileStats.mtimeMs
        }
      })
      .sort((a, b) => b.modifiedAt - a.modifiedAt)

    let retainedBytes = 0
    let retainedFiles = 0
    for (const file of files) {
      const exceedsLimit =
        retainedFiles >= MAX_THUMBNAIL_CACHE_FILES ||
        retainedBytes + file.size > MAX_THUMBNAIL_CACHE_BYTES

      if (exceedsLimit) {
        unlinkSync(file.path)
        continue
      }

      retainedFiles += 1
      retainedBytes += file.size
    }
  }

  private cacheThumbnailBuffer(imageBuffer: Buffer, song: SongData): string {
    if (imageBuffer.length === 0 || imageBuffer.length > MAX_THUMBNAIL_BYTES) {
      throw new Error(`Thumbnail must be between 1 byte and ${MAX_THUMBNAIL_BYTES} bytes`)
    }

    const thumbnailsDir = join(app.getPath('userData'), 'thumbnails')
    mkdirSync(thumbnailsDir, { recursive: true })

    const imageId = this.createThumbnailId(song)
    writeFileSync(join(thumbnailsDir, `${imageId}.jpg`), imageBuffer)
    this.pruneThumbnailCache(thumbnailsDir)

    return `/resource/thumbnail/${imageId}`
  }

  private encodeSongThumbnail(thumbnail: string, song: SongData): string {
    try {
      if (thumbnail.startsWith('data:image/')) {
        const base64Data = thumbnail.split(',', 2)[1]
        if (!base64Data) throw new Error('Thumbnail data URI is malformed')

        const maxEncodedLength = Math.ceil((MAX_THUMBNAIL_BYTES * 4) / 3) + 4
        if (base64Data.length > maxEncodedLength) {
          throw new Error(`Thumbnail data URI exceeds ${MAX_THUMBNAIL_BYTES} bytes`)
        }

        return this.cacheThumbnailBuffer(Buffer.from(base64Data, 'base64'), song)
      }

      if (thumbnail.startsWith('file://')) {
        const localPath = fileURLToPath(thumbnail)
        const sourceStats = statSync(localPath)
        if (!sourceStats.isFile() || sourceStats.size > MAX_THUMBNAIL_BYTES) {
          throw new Error(`Local thumbnail exceeds ${MAX_THUMBNAIL_BYTES} bytes`)
        }

        const thumbnailsDir = join(app.getPath('userData'), 'thumbnails')
        mkdirSync(thumbnailsDir, { recursive: true })
        const imageId = this.createThumbnailId(song)
        copyFileSync(localPath, join(thumbnailsDir, `${imageId}.jpg`))
        this.pruneThumbnailCache(thumbnailsDir)
        return `/resource/thumbnail/${imageId}`
      }
    } catch (error) {
      Logger.warn(`Unable to cache song thumbnail: ${error}`, {
        source: 'SongCache',
        function: 'encodeSongThumbnail'
      })
      return ''
    }

    // Make URLs point to the proxy
    // For external URLs, use the proxy
    if (thumbnail.startsWith('http://') || thumbnail.startsWith('https://')) {
      return `/proxy/v1?url=${encodeURIComponent(thumbnail)}`
    }

    // Return as-is if we can't determine the type
    return thumbnail
  }

  private ensureUpdatedSong = (song: SongData): SongData => {
    if (!song.version || song.version === 1) {
      // Convert v1 to v2
      const abilities: SongAbilities[] = []

      if (song.can_fast_forward) abilities.push(SongAbilities.FAST_FORWARD)
      if (song.can_like) abilities.push(SongAbilities.LIKE)
      if (song.can_skip) abilities.push(SongAbilities.NEXT)
      if (song.can_change_volume) abilities.push(SongAbilities.CHANGE_VOLUME)
      if (song.can_set_output) abilities.push(SongAbilities.SET_OUTPUT)

      return {
        version: 2,
        track_name: song.track_name,
        album: song.album,
        artist: song.artist,
        playlist: song.playlist,
        playlist_id: song.playlist_id,
        shuffle_state: song.shuffle_state,
        repeat_state: song.repeat_state === 'context' ? 'all' : song.repeat_state,
        is_playing: song.is_playing,
        source: 'unknown',
        abilities,
        track_duration: song.track_duration,
        track_progress: song.track_progress,
        volume: song.volume,
        thumbnail: song.thumbnail,
        device: song.device,
        device_id: song.device_id,
        id: song.id,
        liked: song.liked,
        color: song.color,

        // deprecated version info
        can_fast_forward: song.can_fast_forward,
        can_like: song.can_like,
        can_skip: song.can_skip,
        can_change_volume: song.can_change_volume,
        can_set_output: song.can_set_output
      }
    }

    if (song.version === 2) {
      return {
        ...song,
        // fill in deprecated song info with abilities
        can_fast_forward:
          song.can_fast_forward || song.abilities.includes(SongAbilities.FAST_FORWARD),
        can_like: song.can_like || song.abilities.includes(SongAbilities.LIKE),
        can_skip: song.can_skip || song.abilities.includes(SongAbilities.NEXT),
        can_change_volume:
          song.can_change_volume || song.abilities.includes(SongAbilities.CHANGE_VOLUME),
        can_set_output: song.can_set_output || song.abilities.includes(SongAbilities.SET_OUTPUT)
      }
    }

    // Else just return the song object - assuming it is updated or smth
    return song
  }

  /**
   * Sets a new song and schedules the song end event
   */
  private setNewSong(song: SongData): void {
    this.currentSong = this.ensureUpdatedSong(song)

    if (song.thumbnail) {
      this.currentSong.thumbnail = this.encodeSongThumbnail(song.thumbnail, song)
    }

    this.emit(SongCacheEvents.SONG_CHANGED, this.currentSong)

    // Clear existing timeouts if any
    if (this.songEndTimeout) {
      clearTimeout(this.songEndTimeout)
      this.songEndTimeout = null
    }
    if (this.progressInterval) {
      clearInterval(this.progressInterval)
      this.progressInterval = null
    }

    // Set interval for progress updates and timeout for song end if we have duration and progress
    if (song.track_duration && song.track_progress && song.is_playing) {
      const remainingTime = song.track_duration - song.track_progress

      // Update progress every second
      this.progressInterval = setInterval(() => {
        if (
          this.currentSong &&
          this.currentSong.track_progress &&
          this.currentSong.track_duration
        ) {
          this.currentSong.track_progress += 1000
          if (this.currentSong.track_progress >= this.currentSong.track_duration) {
            Logger.debug('Song ended based on duration', {
              source: 'SongCache',
              function: 'setNewSong'
            })
            this.emit(SongCacheEvents.SONG_ENDED)
            this.clear()
          }
        }
      }, 1000)

      // Set a backup timeout for song end
      this.songEndTimeout = setTimeout(() => {
        Logger.debug('Song ended based on duration (backup timeout)', {
          source: 'SongCache',
          function: 'setNewSong'
        })
        this.emit(SongCacheEvents.SONG_ENDED)
        this.clear()
      }, remainingTime)
    }
  }
}
