import type { IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const trustedRenderers = new WeakSet<WebContents>()

export const trustRenderer = (contents: WebContents): void => { trustedRenderers.add(contents) }

export const isRendererUrl = (url: string): boolean => {
  try {
    const target = new URL(url)
    const expected = new URL(process.env.ELECTRON_RENDERER_URL || pathToFileURL(join(__dirname, '../renderer/index.html')).href)
    return target.origin === expected.origin && target.protocol === expected.protocol && target.pathname === expected.pathname
  } catch { return false }
}

export const isTrustedIpcSender = (event: IpcMainInvokeEvent | IpcMainEvent): boolean =>
  trustedRenderers.has(event.sender) && !event.sender.isDestroyed() &&
  event.senderFrame === event.sender.mainFrame && isRendererUrl(event.senderFrame.url)

export const isSafeExternalUrl = (url: string): boolean => {
  try { return ['https:', 'http:', 'mailto:'].includes(new URL(url).protocol) }
  catch { return false }
}
