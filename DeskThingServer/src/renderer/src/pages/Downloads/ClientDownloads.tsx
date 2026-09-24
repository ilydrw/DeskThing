import React, { useCallback, useEffect, useRef, useState } from 'react'
import Sidebar from '@renderer/nav/Sidebar'
import Button from '@renderer/components/Button'
import { IconCarThingSmall, IconLink, IconRefresh, IconPlus } from '@renderer/assets/icons'
import { useClientStore, useReleaseStore, usePageStore } from '@renderer/stores'
import MainElement from '@renderer/nav/MainElement'
import { ProgressChannel } from '@shared/types'
import { ClientDownloadCard } from './ClientDownloadCard'
import { useChannelProgress } from '@renderer/hooks/useProgress'
import AddRepoOverlay from '@renderer/overlays/releases/AddRepoOverlay'
import { DownloadErrorOverlay } from '@renderer/overlays/DownloadErrorOverlay'
import { AddCard } from './AddCard'
import PageHeader from '@renderer/components/PageHeader'

const ClientDownloads: React.FC = () => {
  const clientReleases = useReleaseStore((releaseStore) => releaseStore.clientReleases)
  const refresh = useReleaseStore((releaseStore) => releaseStore.refreshReleases)
  const getClients = useReleaseStore((releaseStore) => releaseStore.getClients)

  const installedClient = useClientStore((clientStore) => clientStore.clientManifest)
  const refreshClient = useClientStore((clientStore) => clientStore.requestClientManifest)
  const clientZip = useClientStore((clientStore) => clientStore.loadClientZip)
  useChannelProgress(ProgressChannel.IPC_CLIENT)
  useChannelProgress(ProgressChannel.IPC_RELEASES)

  const [addClientOverlay, setAddClientOverlay] = useState(false)
  const [clientLoadError, setClientLoadError] = useState<string | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const fetching = useRef(false)

  const [loading, setLoading] = useState(false)
  const [uiState, setUiState] = useState({
    refreshingClients: true
  })

  const loadClients = useCallback(
    async (force = false, readManifest = false): Promise<void> => {
      if (fetching.current) return
      fetching.current = true
      setUiState((prev) => ({ ...prev, refreshingClients: true }))
      setCatalogError(null)
      try {
        if (force) await refresh(true)
        await getClients()
        if (readManifest) await refreshClient()
      } catch {
        setCatalogError(
          'Could not load client releases. Check your connection and repository, then try again.'
        )
      } finally {
        fetching.current = false
        setUiState((prev) => ({ ...prev, refreshingClients: false }))
      }
    },
    [getClients, refresh, refreshClient]
  )

  useEffect(() => {
    void loadClients()
  }, [loadClients])

  const retrieveClients = (): Promise<void> => loadClients(true, true)

  const loadClientZip = async (zip: string): Promise<void> => {
    setLoading(true)
    setClientLoadError(null)
    try {
      const result = await clientZip(zip)
      if (!result.success) {
        setClientLoadError(result.message || 'Unknown error during client zip loading')
      }
    } catch (error) {
      console.error('Failed to load client zip:', error)
      setClientLoadError(
        error instanceof Error ? error.message : `Failed to load client: ${String(error)}`
      )
    } finally {
      setLoading(false)
    }
  }

  const setPage = usePageStore((pageStore) => pageStore.setPage)

  const gotoAppDownloads = (): void => {
    setPage('Downloads/App')
  }

  const handleRefreshData = (): Promise<void> => loadClients(true)

  const handleToggleAddRepo = (): void => {
    setAddClientOverlay((state) => !state)
  }

  return (
    <div className="flex h-full w-full">
      {addClientOverlay && (
        <AddRepoOverlay onClose={handleToggleAddRepo} onZipUpload={loadClientZip} />
      )}
      <Sidebar className="flex justify-between flex-col h-full max-h-full md:items-stretch xs:items-center">
        <div className="flex flex-col gap-2 items-center justify-center">
          {installedClient ? (
            <div>
              <h1 className="font-semibold">Loaded Client:</h1>
              <div className="md:block xs:hidden border p-2 rounded-lg bg-zinc-900 border-zinc-800">
                <p>{installedClient.name}</p>
                <div className="flex w-full justify-between items-center">
                  <p>{installedClient.version}</p>
                  <Button
                    onClick={retrieveClients}
                    className="hover:font-semibold hover:bg-zinc-800 !p-0 !m-0 rounded-3xl group"
                    title="Refresh Client"
                    disabled={uiState.refreshingClients}
                  >
                    <IconRefresh
                      className={`group-disabled:opacity-50 w-5 h-5 group-hover:stroke-2 ${uiState.refreshingClients ? 'animate-spin-smooth' : ''}`}
                      strokeWidth={1.5}
                    />
                  </Button>
                </div>
              </div>
              <div className="md:hidden xs:flex hidden flex-col items-center">
                <p className="break-words">{installedClient.short_name}</p>
                <p>{installedClient.version}</p>
              </div>
            </div>
          ) : (
            <p>No device software installed yet.</p>
          )}
        </div>
        <div>
          <div className="flex flex-col md:items-stretch xs:items-center gap-2">
            <Button
              onClick={handleRefreshData}
              className="hover:bg-zinc-900 w-full"
              disabled={uiState.refreshingClients}
            >
              <IconRefresh
                className={`${uiState.refreshingClients ? 'animate-spin-smooth' : ''}`}
                strokeWidth={1.5}
              />
              <p className="md:block xs:hidden flex-grow xs:text-center">
                Refresh<span className="hidden group-disabled:inline">ing</span>
              </p>
            </Button>
            <Button onClick={handleToggleAddRepo} className="hover:bg-zinc-900">
              <IconPlus />
              <p className="md:block xs:hidden text-center flex-grow">Add Client</p>
            </Button>
            <Button onClick={gotoAppDownloads} className="hover:bg-zinc-900">
              <IconLink strokeWidth={1.5} />
              <p className="md:block xs:hidden text-center flex-grow">Apps</p>
            </Button>
          </div>
        </div>
      </Sidebar>
      <MainElement>
        <div className="page-scroll">
          <div className="page-frame">
            <PageHeader
              eyebrow="Downloads"
              title="Client downloads"
              description="Download or add DeskThing client releases."
              actions={
                <>
                  <Button
                    disabled={uiState.refreshingClients}
                    onClick={handleRefreshData}
                    className="action-button"
                  >
                    <IconRefresh
                      className={uiState.refreshingClients ? 'animate-spin-smooth' : ''}
                    />
                    Refresh
                  </Button>
                  <Button
                    onClick={handleToggleAddRepo}
                    className="action-button action-button-primary"
                  >
                    <IconPlus />
                    Add client
                  </Button>
                </>
              }
            />
            {catalogError && (
              <p role="alert" className="mb-4 text-sm text-amber-200">
                {catalogError}
              </p>
            )}
            <div
              aria-busy={uiState.refreshingClients}
              className="w-full h-fit grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 grid-flow-dense"
            >
              {clientReleases && clientReleases.length > 0 ? (
                <>
                  {clientReleases.map((release) => (
                    <ClientDownloadCard
                      key={release.id}
                      clientRelease={release}
                      loading={loading}
                      setLoading={setLoading}
                    />
                  ))}
                  <AddCard />
                </>
              ) : (
                <div className="empty-state col-span-full">
                  <div className="max-w-md">
                    <div className="empty-state-icon">
                      <IconCarThingSmall iconSize={36} />
                    </div>
                    <h2 className="text-xl font-semibold tracking-tight">
                      {uiState.refreshingClients
                        ? 'Loading client releases'
                        : catalogError
                          ? 'Catalog unavailable'
                          : 'No client releases available'}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {uiState.refreshingClients
                        ? 'Checking available device software…'
                        : 'Add a trusted repository or import a client ZIP to get started. If you already added a repository, refresh to check for releases.'}
                    </p>
                    <Button
                      onClick={handleRefreshData}
                      disabled={uiState.refreshingClients}
                      className="action-button action-button-primary mx-auto mt-5"
                    >
                      <IconRefresh
                        strokeWidth={1.5}
                        className={`${uiState.refreshingClients ? 'animate-spin-smooth' : ''}`}
                      />
                      <span>{uiState.refreshingClients ? 'Loading' : 'Refresh releases'}</span>
                    </Button>
                    <Button onClick={handleToggleAddRepo} className="action-button mx-auto mt-2">
                      <IconPlus /> Add repository or ZIP
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        {clientLoadError && (
          <DownloadErrorOverlay
            error={clientLoadError}
            onAcknowledge={() => setClientLoadError(null)}
            title="Failed to load Client ZIP file: "
          />
        )}
      </MainElement>
    </div>
  )
}

export default ClientDownloads
