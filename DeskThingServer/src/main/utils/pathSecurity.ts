import { isAbsolute, relative, resolve, sep } from 'node:path'

const UNSAFE_PATH_CHARACTERS = '<>:"/\\|?*'

const containsUnsafePathCharacter = (value: string): boolean =>
  [...value].some(
    (character) => character.charCodeAt(0) <= 31 || UNSAFE_PATH_CHARACTERS.includes(character)
  )

export const isSafePathSegment = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 255 &&
  value !== '.' &&
  value !== '..' &&
  !['__proto__', 'prototype', 'constructor'].includes(value) &&
  !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value) &&
  !value.endsWith('.') &&
  !value.endsWith(' ') &&
  !containsUnsafePathCharacter(value)

export const assertSafePathSegment = (value: string, label = 'Path segment'): void => {
  if (!isSafePathSegment(value)) {
    throw new Error(`${label} contains unsupported path characters`)
  }
}

export const resolvePathWithinRoot = (root: string, ...segments: string[]): string | null => {
  const resolvedRoot = resolve(root)
  const candidate = resolve(resolvedRoot, ...segments)
  const relativePath = relative(resolvedRoot, candidate)

  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    return null
  }

  return candidate
}
