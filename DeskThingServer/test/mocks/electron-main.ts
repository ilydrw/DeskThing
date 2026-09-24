import { vi } from 'vitest'

export const app = {
  isPackaged: false,
  getPath: vi.fn(() => ''),
  getVersion: vi.fn(() => '0.0.0-test'),
  on: vi.fn(),
  setAsDefaultProtocolClient: vi.fn()
}

export const net = {
  fetch: vi.fn()
}

export const protocol = {
  handle: vi.fn()
}
