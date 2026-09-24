import { Client, ConnectionState, ClientPlatformIDs } from '@deskthing/types'
import { FC, useEffect, useState } from 'react'
import Button from '@renderer/components/Button'
import useClientStore, { findKnownDeviceForClient } from '@renderer/stores/clientStore'

type DeviceDetailsProps = {
  client: Client
}

export const DeviceDetails: FC<DeviceDetailsProps> = ({ client }) => {
  const [connectedTimeText, setConnectedTimeText] = useState<string>('0s')
  const [deviceName, setDeviceName] = useState('')
  const [isSavingName, setIsSavingName] = useState(false)
  const knownDevices = useClientStore((state) => state.knownDevices)
  const renameDevice = useClientStore((state) => state.renameDevice)
  const forgetDevice = useClientStore((state) => state.forgetDevice)
  const knownDevice = findKnownDeviceForClient(client, knownDevices)

  useEffect(() => {
    setDeviceName(knownDevice?.displayName || '')
  }, [knownDevice?.displayName])

  useEffect(() => {
    const updateTime = (): number | undefined => {
      if (!client.timestamp) {
        setConnectedTimeText('0s')
        return
      }

      const timeDiff = Math.floor((Date.now() - client.timestamp) / 1000)
      let newText = '0s'
      let interval = 1000

      if (timeDiff < 5) {
        const halfSecDiff = Math.floor((Date.now() - client.timestamp) / 100) / 10
        newText = `${halfSecDiff}s`
        interval = 100
      } else if (timeDiff < 60) {
        newText = `${timeDiff}s`
      } else if (timeDiff < 3600) {
        newText = `${Math.floor(timeDiff / 60)}m`
        interval = 60000
      } else {
        newText = `${Math.floor(timeDiff / 3600)}h`
        interval = 3600000
      }

      setConnectedTimeText(newText)
      return interval
    }

    const interval = updateTime()
    const timer = setInterval(updateTime, interval)

    return () => clearInterval(timer)
  }, [client.timestamp])

  const saveDeviceName = async (): Promise<void> => {
    setIsSavingName(true)
    try {
      const renamed = await renameDevice(client.clientId, deviceName)
      setDeviceName(renamed?.displayName || '')
    } finally {
      setIsSavingName(false)
    }
  }

  const resetDeviceName = async (): Promise<void> => {
    setIsSavingName(true)
    try {
      await renameDevice(client.clientId, undefined)
      setDeviceName('')
    } finally {
      setIsSavingName(false)
    }
  }

  const forgetKnownDevice = async (): Promise<void> => {
    const confirmed = window.confirm(
      'Forget this saved device? Its friendly name and connection history will be removed.'
    )
    if (!confirmed) return

    setIsSavingName(true)
    try {
      await forgetDevice(client.clientId)
      setDeviceName('')
    } finally {
      setIsSavingName(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-zinc-950 p-6">
      <div className="flex h-full flex-col gap-6">
        <section className="bg-zinc-800 rounded-lg p-6 shadow-lg">
          <h2 className="text-xl font-semibold mb-4">Device Identity</h2>
          <form
            className="flex flex-col sm:flex-row gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              void saveDeviceName()
            }}
          >
            <input
              value={deviceName}
              maxLength={64}
              onChange={(event) => setDeviceName(event.target.value)}
              placeholder={client.manifest?.context.name || client.manifest?.name || 'Device name'}
              aria-label="Device name"
              className="flex-1 px-4 py-2 bg-zinc-900 rounded-lg border border-zinc-700 focus:outline-none focus:border-zinc-500"
            />
            <Button
              type="submit"
              disabled={isSavingName}
              className="bg-blue-700 hover:bg-blue-600 px-4"
            >
              {isSavingName ? 'Saving...' : 'Save Name'}
            </Button>
            {knownDevice?.displayName && (
              <Button
                type="button"
                disabled={isSavingName}
                onClick={() => void resetDeviceName()}
                className="bg-zinc-700 hover:bg-zinc-600 px-4"
              >
                Reset Name
              </Button>
            )}
          </form>
          {knownDevice && (
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-400">
              <span>First seen: {new Date(knownDevice.firstSeenAt).toLocaleString()}</span>
              <span>Last seen: {new Date(knownDevice.lastSeenAt).toLocaleString()}</span>
              <Button
                type="button"
                disabled={isSavingName}
                onClick={() => void forgetKnownDevice()}
                className="text-red-400 hover:text-red-300 p-0"
              >
                Forget saved device
              </Button>
            </div>
          )}
        </section>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="bg-zinc-800 rounded-lg p-6 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <span className="text-blue-400">⚡</span>
              Connection Status
            </h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-zinc-700">
                <span className="text-zinc-400">Status</span>
                <span className="font-medium">{ConnectionState[client.connectionState]}</span>
              </div>
              {client.connected && (
                <>
                  <div className="flex justify-between items-center py-2 border-b border-zinc-700">
                    <span className="text-zinc-400">Provider</span>
                    <span className="font-medium">{client.primaryProviderId}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-zinc-700">
                    <span className="text-zinc-400">Connected For</span>
                    <span className="font-medium">{connectedTimeText}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between items-center py-2 border-b border-zinc-700">
                <span className="text-zinc-400">Uptime</span>
                <span className="font-medium">
                  {client.uptime ? `${client.uptime} seconds` : 'N/A'}
                </span>
              </div>
            </div>
          </section>

          {client.manifest && (
            <section className="bg-zinc-800 rounded-lg p-6 shadow-lg">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <span className="text-purple-400">📱</span>
                Device Info
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-zinc-700">
                  <span className="text-zinc-400">Platform</span>
                  <span className="font-medium">
                    {ClientPlatformIDs[client.manifest.context.id]}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-zinc-700">
                  <span className="text-zinc-400">Version</span>
                  <span className="font-medium">{client.manifest.version}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-zinc-700">
                  <span className="text-zinc-400">IP Address</span>
                  <span className="font-medium">
                    {client.manifest.context.ip}:{client.manifest.context.port}
                  </span>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
