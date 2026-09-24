/**
 * Parses `adb devices -l` output into the serials of devices that are ready for commands.
 * Devices that are offline, unauthorized, or still connecting are excluded.
 */
export const parseAdbDevices = (output: string): string[] =>
  output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('List of devices attached') && !line.startsWith('*'))
    .map((line) => line.split(/\s+/))
    .filter(([serial, state]) => serial && state === 'device')
    .map(([serial]) => serial)
