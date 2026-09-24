console.log('[ADB Handler] Starting')
import path from 'path'
import { execFile } from 'child_process'
import getPlatform from '@server/utils/get-platform'
import Logger from '@server/utils/logger'
import { storeProvider } from '../stores/storeProvider'
import { progressBus } from '@server/services/events/progressBus'
import { ProgressChannel } from '@shared/types'

const isDevelopment = process.env.NODE_ENV === 'development'
const execPath = isDevelopment
  ? path.join(__dirname, '..', '..', '..', 'adb_source', getPlatform())
  : path.join(process.resourcesPath, getPlatform())

const adbExecutableName = process.platform === 'win32' ? 'adb.exe' : 'adb'
const adbPath = path.join(execPath, adbExecutableName)

/**
 * Splits a string into an array of arguments, handling quoted strings.
 * @param str - The input string to split.
 * @returns An array of arguments extracted from the input string.
 */
const splitArgs = (str: string): string[] => {
  const regex: RegExp = /(".*?"|[^"\s]+)(?=\s*|\s*$)/g
  const matches: string[] = []
  let match: RegExpExecArray | null

  while ((match = regex.exec(str)) !== null) {
    matches.push(match[1].replace(/(^"|"$)/g, '')) // Remove surrounding quotes if any
  }

  return matches
}

export const DEFAULT_ADB_TIMEOUT_MS = 120_000

export type AdbCommandOptions = {
  /** Kills the adb process after this long so a hung device cannot block its command queue. */
  timeoutMs?: number
  /** Skips progress notifications and info logs for background polling. */
  quiet?: boolean
}

/**
 * Executes an ADB command and returns the output.
 * @param command - The ADB command to execute.
 * @param options - Timeout and reporting options.
 * @channel - {@link ProgressChannel.ADB}
 * @returns A Promise that resolves with the output of the ADB command.
 */
export const handleAdbCommands = async (
  command: string,
  options: AdbCommandOptions = {}
): Promise<string> => {
  const { timeoutMs = DEFAULT_ADB_TIMEOUT_MS, quiet = false } = options
  const update = quiet
    ? (): void => undefined
    : progressBus.start(ProgressChannel.ADB, 'ADB - Runner', 'Executing ADB Command')
  const settingsStore = await storeProvider.getStore('settingsStore')
  const useGlobalADB = await settingsStore.getSetting('adb_useGlobal')
  if (!quiet) Logger.info(useGlobalADB ? 'Using Global ADB' : 'Using Local ADB')
  update(`Executing ${command} using ${useGlobalADB ? 'Global ADB' : 'Local ADB'}`, 10)
  return new Promise((resolve, reject) => {
    execFile(
      useGlobalADB ? 'adb' : adbPath,
      splitArgs(command),
      { cwd: execPath, timeout: timeoutMs, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          const timedOut = error.killed === true
          const reason = timedOut ? `timed out after ${timeoutMs}ms` : stderr
          if (!quiet) progressBus.error(ProgressChannel.ADB, 'Error Encountered!', error.message)
          Logger.error(
            `ADB Error: ${timedOut ? 'TIMEOUT' : `STDERR: ${stderr}`}  STDOUT: ${stdout}, COMMAND: ${command}, PATH: ${adbPath}`,
            {
              error: error as Error,
              function: 'adbHandler',
              source: 'adbHandler'
            }
          )
          reject(new Error(`ADB Error: ${reason}, ${command}, ${adbPath}`))
        } else {
          if (!quiet) progressBus.complete(ProgressChannel.ADB, 'ADB Success!')
          resolve(stdout)
        }
      }
    )
  })
}
