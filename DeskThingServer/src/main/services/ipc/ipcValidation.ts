import { PlatformIDs } from '@deskthing/types'
import { FLASH_REQUEST, IPC_HANDLERS } from '@shared/types'
import { isRecord, isSettingValue } from '@shared/validation/settings'
import { Settings } from '@shared/types'
import { isSafePathSegment } from '@server/utils/pathSecurity'

type Validator = (value: unknown) => boolean
const none: Validator = (value) => value === undefined
const text: Validator = (value) => typeof value === 'string' && value.length > 0
const optionalText: Validator = (value) => value === undefined || typeof value === 'string'
const boolean: Validator = (value) => typeof value === 'boolean'
const optionalBoolean: Validator = (value) => value === undefined || boolean(value)
const shape = (fields: Record<string, Validator>): Validator => (value) =>
  isRecord(value) && Object.entries(fields).every(([key, check]) => check(value[key]))
const action = shape({ id: text, source: text })
const profile = shape({ id: isSafePathSegment, version: text })
const settings: Validator = (value) => isRecord(value) && Object.entries(value).every(
  ([key, setting]) => isSettingValue(key as keyof Settings, setting)
)
const task = shape({ source: isSafePathSegment, taskId: text })

// Request keys match the shared IPC unions. Domain validators still check nested app/device data.
const rules: Record<Exclude<IPC_HANDLERS, IPC_HANDLERS.PLATFORM>, Record<string, Validator>> = {
  apps: {
    'app/get': none, 'data/get': isSafePathSegment, 'settings/get': isSafePathSegment,
    'data/set': shape({ appId: isSafePathSegment, data: isRecord }),
    'settings/set': shape({ appId: isSafePathSegment, settings: isRecord }),
    stop: isSafePathSegment, disable: isSafePathSegment, enable: isSafePathSegment,
    run: isSafePathSegment, purge: isSafePathSegment, postinstall: isSafePathSegment,
    zip: text, url: text, add: shape({ filePath: optionalText, meta: (value) => value === undefined || isRecord(value) }),
    staged: shape({ overwrite: optionalBoolean, appId: (value) => value === undefined || isSafePathSegment(value) }),
    'user-data-response': shape({ requestId: text, response: isRecord }),
    'select-zip-file': none, 'dev-add-app': shape({ appPath: text }),
    'send-to-app': shape({ app: isSafePathSegment, type: text }),
    'app-order': (value) => Array.isArray(value) && value.every(isSafePathSegment),
    icon: shape({ appId: isSafePathSegment, icon: optionalText })
  },
  client: {
    zip: text, url: text, pingClient: text, adb: text,
    'client-manifest/get': none, 'client-manifest/get-device': text,
    'client-manifest/set-device': shape({ adbId: text, client: isRecord }),
    'client-manifest/set': isRecord, 'download-latest': none, 'open-client': none,
    'push-staged': shape({ adbId: text }), 'push-proxy-script': text,
    'run-device-command': shape({ clientId: text, command: text }),
    'icon/get': action, 'icon/set': shape({ id: text, icon: text }),
    'known-devices/get': none,
    'known-devices/rename': shape({ deviceId: text, displayName: optionalText }),
    'known-devices/forget': shape({ deviceId: text })
  },
  device: {
    ['flasher_get/' + FLASH_REQUEST.STEPS]: none,
    ['flasher_get/' + FLASH_REQUEST.STATE]: none,
    ['flasher_get/' + FLASH_REQUEST.DEVICE_SELECTION]: none,
    ['flasher_set/' + FLASH_REQUEST.FILE_PATH]: text,
    ['flasher_set/' + FLASH_REQUEST.DEVICE_SELECTION]: text,
    'operation/start': none, 'operation/usbmode': none, 'operation/cancel': none,
    'operation/restart': none, 'operation/unbrick': none, 'operation/driver': none,
    'operation/autoconfig': (value) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6,
    'thingify_get/firmware': none, 'thingify_get/versions': text,
    'thingify_get/file': none, 'thingify_get/files': none,
    'thingify_set/download': shape({ version: text, file: text }),
    'thingify_set/upload': text, 'thingify_set/file': text, 'thingify_set/latest': none
  },
  feedback: { 'add-feedback/set': isRecord, 'get-system-info/get': none },
  releases: {
    'github:refresh': none, 'github:addRepo': text, 'github:getRepositories': none,
    'github:getRepoAssets': none, 'github:getApps': none, 'github:getAppRepositories': none,
    'github:removeAppRepo': text, 'github:downloadApp': text, 'github:getClients': none,
    'github:getClientRepositories': none, 'github:removeClientRepo': text, 'github:downloadClient': text
  },
  tasks: {
    get: none, pause: none, complete_task: task, start: task, stop: task,
    restart: task, previous: task, next: task,
    complete: shape({ source: isSafePathSegment, taskId: text, stepId: text }),
    'update-task': shape({ source: isSafePathSegment, newTask: isRecord }),
    'update-step': shape({ source: isSafePathSegment, taskId: text, newStep: isRecord })
  },
  update: { check: none, download: none, restart: none },
  utility: {
    ping: none, zip: none, 'connections/get': none, 'connections/delete': text,
    'settings/get': none, 'settings/set': settings, logs: none, shutdown: none,
    'open-log-folder': none, 'refresh-firewall': none, 'restart-server': none,
    'actions/get': none, 'actions/set': action, 'actions/delete': text,
    'buttons/set': isRecord, 'buttons/delete': isRecord,
    'keys/get': none, 'keys/set': shape({ id: text, source: text, modes: (value) => Array.isArray(value) }),
    'keys/delete': text, 'profiles/get': text, 'profiles/getAll': none,
    'profiles/set': profile, 'profiles/delete': text, 'map/get': none, 'map/set': profile,
    run: action, 'supporters/get': (value) => value === undefined || isRecord(value),
    'flag/get': text, 'flag/toggle': text, 'flag/set': shape({ flagId: text, flagState: boolean }),
    'notification/get': none, 'notification/acknowledge': isRecord,
    dialog: isRecord, 'devmode/open_terminal': none
  }
}

const validatePlatform = (data: Record<string, unknown>): boolean => {
  const key = String(data.type) + (data.request === undefined ? '' : '/' + data.request)
  switch (data.platform) {
    case PlatformIDs.MAIN:
      return (data.type === 'refresh-clients' && data.request === undefined) ||
        (data.type === 'initial-data' && optionalText(data.request))
    case PlatformIDs.WEBSOCKET:
      return (data.type === 'restart' || (['ping', 'pong', 'disconnect'].includes(String(data.type)) && text(data.clientId))) && optionalText(data.request)
    case PlatformIDs.ADB:
      if (key === 'get/devices' || key === 'refresh/adb') return true
      if (!text(data.adbId)) return false
      switch (key) {
        case 'get/manifest': case 'push/staged': case 'configure/client': return true
        case 'set/manifest': return isRecord(data.manifest)
        case 'set/supervisor': return text(data.service) && boolean(data.state)
        case 'set/brightness': return typeof data.brightness === 'number' && Number.isFinite(data.brightness) && data.brightness >= 0 && data.brightness <= 100
        case 'push/script': return text(data.scriptId) && optionalBoolean(data.force)
        case 'run/command': return text(data.command)
      }
      return false
    case PlatformIDs.BLUETOOTH:
      return data.type === 'do-something' && data.payload === 'etc'
    default: return false
  }
}

export const validateIpcData = (channel: IPC_HANDLERS, data: unknown): void => {
  if (!isRecord(data) || !text(data.type) || (data.request !== undefined && typeof data.request !== 'string')) {
    throw new Error('Invalid IPC request envelope')
  }
  if (channel === IPC_HANDLERS.PLATFORM) {
    if (!validatePlatform(data)) throw new Error('Invalid platform request')
    return
  }
  if (data.kind !== channel) throw new Error('IPC request channel mismatch')
  const key = String(data.type) + (data.request === undefined ? '' : '/' + data.request)
  const channelRules = rules[channel]
  if (!Object.hasOwn(channelRules, key) || !channelRules[key](data.payload)) {
    throw new Error('Unsupported IPC operation or invalid payload')
  }
  if (data.options !== undefined && !shape({ force: optionalBoolean })(data.options)) {
    throw new Error('Invalid IPC options')
  }
}
