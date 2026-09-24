import React, { useEffect, useRef, useState } from 'react'
import Sidebar from '@renderer/nav/Sidebar'
import { useClientStore, usePageStore, useSettingsStore } from '@renderer/stores'
import Button from '@renderer/components/Button'
import {
  IconDownload,
  IconCarThingSmall,
  IconLink,
  IconPlus,
  IconQR,
  IconRefresh,
  IconReload
} from '@renderer/assets/icons'
import MainElement from '@renderer/nav/MainElement'
import { deviceMessages } from '@renderer/assets/refreshMessages'
import ConnectionComponent from '@renderer/components/Client/Connection'
import { useSearchParams } from 'react-router-dom'
import { ProgressChannel } from '@shared/types'
import { useChannelProgress } from '@renderer/hooks/useProgress'
import PageHeader from '@renderer/components/PageHeader'

const ClientConnections: React.FC = () => {
  const settings = useSettingsStore((settings) => settings.settings)
  const clients = useClientStore((state) => state.clients)
  const clientManifest = useClientStore((state) => state.clientManifest)
  const refreshConnections = useClientStore((state) => state.refreshConnections)
  const setPage = usePageStore((pageStore) => pageStore.setPage)
  const refreshClient = useClientStore((clientStore) => clientStore.requestClientManifest)
  const downloadLatestClient = useClientStore((state) => state.downloadLatestClient)
  useChannelProgress(ProgressChannel.IPC_PLATFORM)
  useChannelProgress(ProgressChannel.IPC_CLIENT)

  const refreshRef = useRef<HTMLButtonElement>(null)

  // Visibility States
  const [searchParams, setSearchParams] = useSearchParams()

  // Refreshing ADB Devices
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isRestarting, setIsRestarting] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [refreshCount, setRefreshCount] = useState(0)
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0)

  useEffect(() => {
    if (clients.length === 0) {
      const eligibleMessages = deviceMessages.filter((msg) => msg.minimum <= refreshCount)
      const totalWeight = eligibleMessages.reduce((sum, msg) => sum + msg.weight, 0)
      let randomWeight = Math.random() * totalWeight
      let selectedIndex = 0

      for (let i = 0; i < eligibleMessages.length; i++) {
        randomWeight -= eligibleMessages[i].weight
        if (randomWeight <= 0) {
          selectedIndex = deviceMessages.findIndex(
            (msg) => msg.message === eligibleMessages[i].message
          )
          break
        }
      }

      setCurrentMessageIndex(selectedIndex)
    }
  }, [refreshCount])

  const handleRefresh = async (): Promise<void> => {
    if (!isRefreshing) {
      setIsRefreshing(true)
      setActionError(null)
      try {
        if (!(await refreshConnections())) {
          setActionError('Could not refresh devices. Check your connection and try again.')
        }
      } catch {
        setActionError('Could not refresh devices. Check your connection and try again.')
      } finally {
        setIsRefreshing(false)
        setRefreshCount((prevCount) => prevCount + 1)
      }
    }
  }

  // Functions
  const openQr = (): void => {
    searchParams.set('qr', 'true')
    setSearchParams(searchParams)
  }

  // Functions
  const openSetup = (): void => {
    searchParams.set('setup', 'true')
    searchParams.set('page', 'adb')
    setSearchParams(searchParams)
  }

  const handleDownloadsNav = (): void => {
    setPage('Downloads/Client')
  }

  const handleRestartServerClick = async (): Promise<void> => {
    if (isRestarting) return
    setIsRestarting(true)
    setActionError(null)
    try {
      await window.electron.utility.restartServer()
    } catch {
      setActionError('Could not restart the server. Check the logs and try again.')
    } finally {
      setIsRestarting(false)
    }
  }

  const handleRefreshData = async (): Promise<void> => {
    if (!isRefreshing) {
      setIsRefreshing(true)
      setActionError(null)
      try {
        await refreshClient()
      } catch {
        setActionError('Could not read device software. Try again or open Downloads.')
      } finally {
        setIsRefreshing(false)
      }
    }
  }

  const handleDownloadLatest = async (): Promise<void> => {
    if (isDownloading) return
    setIsDownloading(true)
    setActionError(null)
    try {
      await downloadLatestClient()
      if (!(await refreshClient())) {
        setActionError(
          'No device software was installed. Open Downloads to add a trusted client repository or import a client ZIP.'
        )
      }
    } catch {
      setActionError(
        'Could not download device software. Check your connection or import a client ZIP from Downloads.'
      )
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="flex h-full w-full">
      <Sidebar>
        <div>
          <div className="md:block xs:hidden block">
            {settings.flag_nerd &&
              settings.server_localIp &&
              settings.server_localIp.map((ip, index) => (
                <div key={index} className="text-gray-500">
                  {ip + ':' + settings.device_devicePort}
                </div>
              ))}

            <div className="mt-2 rounded-xl border border-white/5 bg-white/[0.025] p-3">
              {clientManifest ? (
                <>
                  <p className="page-eyebrow !mb-2">Staged client</p>
                  <p className="text-sm font-medium text-slate-200">{clientManifest.name}</p>
                  <p className="mt-1 font-geistMono text-[10px] text-slate-600">
                    v{clientManifest.version}
                  </p>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <span className="connection-pill-dot !bg-amber-300 !shadow-[0_0_12px_rgba(252,211,77,0.6)]" />
                  <p className="text-xs font-medium text-slate-400 text-center">
                    Client package missing
                  </p>
                  <div className="flex justify-around w-full md:flex-row flex-col rounded-lg bg-black/20">
                    <Button
                      onClick={handleRefreshData}
                      className="group justify-center hover:bg-white/5"
                      title="Refresh Client"
                      disabled={isRefreshing}
                    >
                      <IconRefresh
                        className={`group-disabled:opacity-50 group-hover:stroke-2 ${isRefreshing ? 'animate-spin-smooth' : ''}`}
                        strokeWidth={1.5}
                      />
                    </Button>
                    <Button
                      disabled={isDownloading}
                      onClick={handleDownloadLatest}
                      title="Download Latest"
                      className="group justify-center hover:bg-white/5"
                    >
                      <IconDownload
                        strokeWidth={1.5}
                        className="group-disabled:opacity-50 group-hover:stroke-2"
                      />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Button
            title="Go to Downloads Page"
            onClick={handleDownloadsNav}
            className="hover:bg-zinc-900"
          >
            <IconLink strokeWidth={1.5} />
            <p className="md:block xs:hidden text-center flex-grow">Downloads</p>
          </Button>
          {settings.flag_nerd && (
            <Button
              className={`hover:bg-zinc-900 ${isRestarting ? 'cursor-not-allowed opacity-50' : ''}`}
              onClick={handleRestartServerClick}
              disabled={isRestarting}
              title="Restart the server"
            >
              <IconReload
                strokeWidth={1.5}
                className={
                  isRestarting ? '-rotate-[360deg] transition-transform duration-1000' : ''
                }
              />
              <p className="md:block xs:hidden text-center flex-grow">Restart Server</p>
            </Button>
          )}
        </div>
      </Sidebar>
      <MainElement>
        <div className="page-scroll">
          <div className="page-frame">
            <PageHeader
              eyebrow="Devices"
              title="Devices"
              description="Connect and manage DeskThing displays."
              actions={
                <>
                  <Button className="action-button" onClick={openQr} title="Show pairing QR code">
                    <IconQR />
                    <span className="hidden sm:inline">Pair with QR</span>
                  </Button>
                  <Button
                    className="action-button"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    ref={refreshRef}
                  >
                    <IconRefresh strokeWidth={1.5} className={isRefreshing ? 'animate-spin' : ''} />
                    <span className="hidden sm:inline">
                      {isRefreshing ? 'Searching' : 'Refresh'}
                    </span>
                  </Button>
                  <Button className="action-button action-button-primary" onClick={openSetup}>
                    <IconPlus strokeWidth={2} iconSize={22} />
                    <span>Add device</span>
                  </Button>
                </>
              }
            />

            {actionError && (
              <p
                role="alert"
                className="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200"
              >
                {actionError}
              </p>
            )}

            {clients.length > 0 ? (
              <div className="flex flex-col gap-3">
                {clients.map((client) => (
                  <ConnectionComponent key={client.clientId} client={client} />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="max-w-md">
                  <div className="empty-state-icon">
                    <IconCarThingSmall iconSize={36} />
                  </div>
                  <h2 className="text-xl font-semibold tracking-tight text-slate-100">
                    No devices yet
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-500">
                    {deviceMessages[currentMessageIndex].message} Pair a display to install apps and
                    manage it from this server.
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    <Button className="action-button action-button-primary" onClick={openSetup}>
                      <IconPlus iconSize={20} />
                      Add your first device
                    </Button>
                    <Button className="action-button" onClick={openQr}>
                      <IconQR iconSize={20} />
                      Show QR
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </MainElement>
    </div>
  )
}

export default ClientConnections
