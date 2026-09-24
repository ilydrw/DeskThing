import { PlatformTypes } from '@deskthing/types'

/**
 * Platform identifiers that have appeared in published app manifests but are not
 * valid PlatformTypes values, mapped to their canonical equivalents.
 * e.g. Spotify v0.11.1 and other pre-0.11.2 app releases shipped "macos", which
 * made them appear incompatible on mac even though they run fine.
 */
const LEGACY_PLATFORM_ALIASES: Record<string, PlatformTypes> = {
  macos: PlatformTypes.MAC,
  osx: PlatformTypes.MAC,
  darwin: PlatformTypes.MAC,
  win: PlatformTypes.WINDOWS,
  win32: PlatformTypes.WINDOWS
}

/**
 * Normalizes a manifest's platform list, translating legacy identifiers
 * (e.g. "macos") to their canonical PlatformTypes values and lowercasing
 * case variants. Unrecognized values are preserved as-is.
 *
 * @param platforms The platforms array from an app manifest, if any
 * @returns The normalized platforms array, or undefined if none was provided
 */
export const normalizePlatforms = (
  platforms: (PlatformTypes | string)[] | undefined
): PlatformTypes[] | undefined =>
  platforms?.map((platform) => {
    const lowered = String(platform).toLowerCase()
    return LEGACY_PLATFORM_ALIASES[lowered] ?? (lowered as PlatformTypes)
  })
