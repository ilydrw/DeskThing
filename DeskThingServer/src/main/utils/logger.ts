/**
 * The `Logger` class is a singleton that provides logging functionality for the application.
 * It writes log messages to a JSON file and a readable log file, and also logs messages to the console with colored output.
 * The log level can be configured through the `Settings` store.
 */
import fs from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { LOGGING_LEVELS } from '@deskthing/types'
import { Log, LOG_FILTER, ReplyData, ReplyFn, LoggingOptions, LOG_CONTEXTS } from '@shared/types'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { SettingsStoreClass } from '@shared/stores/settingsStore'
import {
  appendBoundedLogFile,
  MAX_PERSISTED_LOGS,
  mergePersistedLogs,
  pruneLogArchives,
  rotateLogFile,
  truncateLogMessage
} from './logRetention'

// Logger configuration
const logFile = join(app.getPath('userData'), 'logs', 'application.log.json')
const readableLogFile = join(app.getPath('userData'), 'logs', 'readable.log')
// Ensure log directory exists
const logDir = join(app.getPath('userData'), 'logs')

class Logger {
  private static instance: Logger
  private listeners: ((data: Log) => void)[] = []
  private logs: Log[] = []
  private logLevel: LOG_FILTER = LOG_FILTER.INFO
  private logContext: LOG_CONTEXTS[] = [LOG_CONTEXTS.APP, LOG_CONTEXTS.SERVER, LOG_CONTEXTS.CLIENT]
  private filesSetup = false
  private saveTimeout: NodeJS.Timeout | null = null
  private setupPromise: Promise<void>
  private saveQueue: Promise<void> = Promise.resolve()
  private readableWriteQueue: Promise<void> = Promise.resolve()

  private constructor() {
    this.setupPromise = this.setupFiles().catch((error) => {
      console.error('Failed to setup logging files!', error)
    })
  }

  public setupSettingsListener = async (settingsStore: SettingsStoreClass): Promise<void> => {
    const logLevel = await settingsStore.getSetting('server_LogLevel')
    if (logLevel) {
      this.logLevel = logLevel || LOG_FILTER.INFO
    }

    const logContext = await settingsStore.getSetting('server_LogContext')
    if (logContext) {
      this.logContext = logContext || [LOG_CONTEXTS.APP, LOG_CONTEXTS.SERVER, LOG_CONTEXTS.CLIENT]
    }

    settingsStore.on('server_LogLevel', (loggingLevel) => {
      this.logLevel = loggingLevel || LOG_FILTER.INFO
    })

    settingsStore.on('server_LogContext', (loggingContext) => {
      this.logContext = loggingContext || [
        LOG_CONTEXTS.APP,
        LOG_CONTEXTS.SERVER,
        LOG_CONTEXTS.CLIENT
      ]
    })
  }

  private setupFiles = async (): Promise<void> => {
    await mkdir(logDir, { recursive: true, mode: 0o755 })

    const initializeFile = async (filePath: string, initialContent: string): Promise<void> => {
      await writeFile(filePath, initialContent, {
        encoding: 'utf-8',
        mode: 0o644 // Readable by user, read-only for others
      })
    }

    await Promise.all([rotateLogFile(logFile), rotateLogFile(readableLogFile)])
    await Promise.all([initializeFile(logFile, '[]'), initializeFile(readableLogFile, '')])
    await Promise.all([pruneLogArchives(logFile), pruneLogArchives(readableLogFile)])

    this.filesSetup = true
  }

  /**
   * Gets the singleton instance of the `Logger` class.
   * If the instance doesn't exist, it creates a new instance and returns it.
   * @returns The singleton instance of the `Logger` class.
   */
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  private saveLogs = async (): Promise<void> => {
    await this.setupPromise
    if (!this.filesSetup) {
      console.warn('Attempted to save logs before the log file was setup')
      return
    }

    const pendingLogs = this.logs.splice(0).map((log) => ({
      ...log,
      log: truncateLogMessage(log.log)
    }))
    if (pendingLogs.length === 0) return

    let existingLogs: Log[] = []
    try {
      const fileLogs = await readFile(logFile, 'utf8')
      const parsedLogs: unknown = JSON.parse(fileLogs)
      existingLogs = Array.isArray(parsedLogs) ? (parsedLogs as Log[]) : []
    } catch (readError) {
      console.warn('Failed to read existing logs; replacing the malformed log file', readError)
    }

    try {
      const combinedLogs = mergePersistedLogs(existingLogs, pendingLogs, MAX_PERSISTED_LOGS)
      await writeFile(logFile, JSON.stringify(combinedLogs, null, 2))
    } catch (error) {
      this.logs.unshift(...pendingLogs)
      this.logs = this.logs.slice(-MAX_PERSISTED_LOGS)
      console.error('Failed to save logs:', error)
    }
  }

  private debouncedSaveLogs = async (): Promise<void> => {
    if (this.saveTimeout) return
    this.saveTimeout = setTimeout(async () => {
      this.saveTimeout = null
      this.saveQueue = this.saveQueue.then(this.saveLogs).catch((error) => {
        console.error('Failed to process the log save queue:', error)
      })
      await this.saveQueue
    }, 4000)
  }

  private appendReadableLog = async (message: string): Promise<void> => {
    this.readableWriteQueue = this.readableWriteQueue
      .then(async () => {
        await this.setupPromise
        if (!this.filesSetup) return
        await appendBoundedLogFile(readableLogFile, message)
      })
      .catch((error) => {
        console.error('Failed to write to readable log file:', error)
      })

    await this.readableWriteQueue
  }

  /**
   * Sets the log level of the `Logger` instance.
   * @param level - The new log level to set.
   */
  public setLogLevel(level: LOG_FILTER): void {
    this.logLevel = level
  }

  public info = async (message: string, options?: LoggingOptions): Promise<void> => {
    await this.log(LOGGING_LEVELS.LOG, message, options)
  }

  public warn = async (message: string, options?: LoggingOptions): Promise<void> => {
    await this.log(LOGGING_LEVELS.WARN, message, options)
  }

  public error = async (message: string, options?: LoggingOptions): Promise<void> => {
    await this.log(LOGGING_LEVELS.ERROR, message, options)
  }

  public debug = async (message: string, options?: LoggingOptions): Promise<void> => {
    await this.log(LOGGING_LEVELS.DEBUG, message, options)
  }

  /**
   * Creates a debug function with the given options
   * @param options The options to use for the debug function
   * @returns The debug function
   */
  public createLogger = (
    options: LoggingOptions
  ): {
    log: (...args: unknown[]) => void
    debug: (...args: unknown[]) => void
    warn: (...args: unknown[]) => void
    error: (...args: unknown[]) => void
    fatal: (...args: unknown[]) => void
  } => {
    const makeLogger =
      (level: LOGGING_LEVELS) =>
      (...args: unknown[]) => {
        const message = args
          .map((arg) => {
            if (typeof arg === 'function' || typeof arg === 'symbol') {
              return '[Unloggable]'
            }
            if (typeof arg === 'string') return arg
            try {
              return JSON.stringify(arg)
            } catch {
              return String(arg)
            }
          })
          .join(' ')
        this.log(level, message, options)
      }

    return {
      log: makeLogger(LOGGING_LEVELS.LOG),
      debug: makeLogger(LOGGING_LEVELS.DEBUG),
      warn: makeLogger(LOGGING_LEVELS.WARN),
      error: makeLogger(LOGGING_LEVELS.ERROR),
      fatal: makeLogger(LOGGING_LEVELS.FATAL)
    }
  }

  public fatal = async (message: string, options?: LoggingOptions): Promise<void> => {
    await this.log(LOGGING_LEVELS.FATAL, message, options)
  }

  private shouldLog(context: LOG_CONTEXTS, level: LOG_FILTER | LOGGING_LEVELS): boolean {
    const levels = [
      LOGGING_LEVELS.DEBUG,
      LOG_FILTER.DEBUG,
      LOGGING_LEVELS.MESSAGE,
      LOG_FILTER.MESSAGE,
      LOGGING_LEVELS.LOG,
      LOG_FILTER.LOG,
      LOGGING_LEVELS.WARN,
      LOG_FILTER.WARN,
      LOGGING_LEVELS.ERROR,
      LOG_FILTER.ERROR,
      LOGGING_LEVELS.FATAL,
      LOG_FILTER.FATAL,
      LOG_FILTER.SILENT
    ]

    if (!this.logContext.includes(context)) {
      return false // if a context is specified that this log is not included in
    }

    if (this.logLevel === LOG_FILTER.SILENT) {
      return false // generalized if it is silent
    }

    if (levels.indexOf(level) >= levels.indexOf(this.logLevel)) {
      return true
    }

    return false
  }

  private reconstructOptions = (
    options?: LoggingOptions
  ): LoggingOptions & { context: LOG_CONTEXTS; date: string } => {
    return {
      context: LOG_CONTEXTS.SERVER,
      date: new Date().toISOString(),
      store: options?.store || options?.source,
      method: options?.method || options?.function,
      ...options
    }
  }
  /**
   * Logs a message with the specified level and source.
   * @param level - The message type (e.g. ERROR, WARNING, MESSAGE, LOGGING, FATAL, DEBUG).
   * @param message - The message to be logged.
   * @param source - The source of the message (default is 'server').
   * @returns A Promise that resolves when the message has been logged.
   */
  async log(level: LOGGING_LEVELS, message: string, prevOptions?: LoggingOptions): Promise<void> {
    try {
      const options = this.reconstructOptions(prevOptions)
      if (!this.shouldLog(options.context, level)) {
        return
      }

      if (options.error instanceof Error) {
        options.error = {
          name: options.error.name,
          message: options.error.message,
          stack: options.error.stack
        }
      } else {
        if (options.error) {
          options.error = new Error('Abnormal error detected: ', { cause: options.error })
        }
      }

      const logData: Log = {
        options: options,
        type: level,
        log: message
      }

      try {
        // dont log anything below warn
        if (
          ![LOGGING_LEVELS.DEBUG, LOGGING_LEVELS.LOG, LOGGING_LEVELS.MESSAGE].includes(
            logData.type
          ) ||
          logData.options.context != LOG_CONTEXTS.SERVER
        ) {
          await this.notifyListeners(logData)
        }
      } catch (error) {
        console.warn('Failed to notify listeners', error)
      }

      const readableTimestamp = new Date(options.date).toLocaleTimeString()
      const readableLocation = `${options.store || ''}${options.method ? `(${options.method})` : ''}`
      const readableMessage = `${options.context} ${readableTimestamp}${readableLocation ? ` ${readableLocation}` : ''}: ${truncateLogMessage(message)}\n${options.error ? truncateLogMessage(options.error.message) + '\n' : ''}`

      switch (level) {
        case LOGGING_LEVELS.ERROR:
          console.error('\x1b[31m%s\x1b[0m', readableMessage) // Red for error
          break
        case LOGGING_LEVELS.WARN:
          console.warn('\x1b[33m%s\x1b[0m', readableMessage) // Yellow for warning
          break
        case LOGGING_LEVELS.MESSAGE:
          console.log('\x1b[32m%s\x1b[0m', readableMessage) // Green for messages
          break
        case LOGGING_LEVELS.LOG:
          console.log('\x1b[90m%s\x1b[0m', readableMessage) // Dark gray for info
          break
        case LOGGING_LEVELS.FATAL:
          console.log('\x1b[35m%s\x1b[0m', readableMessage) // Magenta for fatal
          break
        case LOGGING_LEVELS.DEBUG:
          console.debug('\x1b[36m%s\x1b[0m', readableMessage) // Cyan for debug
          break
        default:
          console.log('\x1b[0m%s', readableMessage) // Default color for other types
      }

      this.debouncedSaveLogs()
      await this.appendReadableLog(readableMessage)
    } catch (error) {
      console.error('Failed to log message:', error)
      throw error
    }
  }

  /**
   * Notifies all registered listeners with the provided log data.
   *
   * @param data - The log data to pass to the registered listeners.
   * @returns A Promise that resolves when the notification process is complete.
   */
  async notifyListeners(data: Log): Promise<void> {
    try {
      this.logs.push(data)
      if (this.logs.length > MAX_PERSISTED_LOGS) this.logs.splice(0, this.logs.length - MAX_PERSISTED_LOGS)
      await Promise.all(this.listeners.map((listener) => listener(data)))
    } catch (error) {
      console.error('[Logger]: Failed to notify some listeners', error)
    }
  }

  /**
   * Adds a listener callback that will be notified when log data is available.
   *
   * @param callback - The callback function to be called with the log data.
   */
  addListener(callback: (data: Log) => void): void {
    this.listeners.push(callback)
  }

  /**
   * Retrieves the logs stored in the log file.
   *
   * @returns A Promise that resolves with an array of log entries, or an empty array if the log file does not exist.
   */
  public async getLogs(num_logs: number = 20): Promise<Log[]> {
    await this.setupPromise
    if (!fs.existsSync(logFile)) {
      return []
    }

    try {
      const data = await readFile(logFile, 'utf8')
      if (!data) {
        return []
      }
      const logs = data ? JSON.parse(data) : []
      return logs.slice(-num_logs)
    } catch (error) {
      console.error('Error reading existing log data', error)
      return []
    }
  }

  public async flush(): Promise<void> {
    if (this.saveTimeout) clearTimeout(this.saveTimeout)
    this.saveTimeout = null
    this.saveQueue = this.saveQueue.then(this.saveLogs)
    await this.saveQueue
    await this.readableWriteQueue
  }
}

/**
 * A higher-order function that wraps a reply function with logging functionality.
 *
 * The `ResponseLogger` function takes a `replyFn` function as an argument and returns a new function that logs the reply data before calling the original `replyFn`.
 *
 * @param replyFn - The original reply function to be wrapped.
 * @returns A new function that logs the reply data before calling the original `replyFn`.
 */
export const ResponseLogger = (replyFn: ReplyFn): ReplyFn => {
  return async (channel: string, reply: ReplyData): Promise<void> => {
    await Logger.getInstance().log(LOGGING_LEVELS.LOG, `${JSON.stringify(reply)}`, {
      function: channel,
      source: 'ResponseLogger'
    })
    await replyFn(channel, reply)
  }
}

export default Logger.getInstance()
