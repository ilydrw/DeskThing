import React, { useCallback, useEffect, useRef, useState } from 'react'
import Sidebar from '@renderer/nav/Sidebar'
import Button from '@renderer/components/Button'
import { IconLayoutgrid, IconLink, IconPlus, IconRefresh } from '@renderer/assets/icons'
import { useAppStore, useReleaseStore, usePageStore } from '@renderer/stores'
import MainElement from '@renderer/nav/MainElement'
import { SuccessNotification } from '@renderer/overlays/SuccessNotification'
import AddRepoOverlay from '@renderer/overlays/releases/AddRepoOverlay'
import { ProgressChannel } from '@shared/types'
import { AppReleaseCard } from './AppDownloadCard'
import { useChannelProgress } from '@renderer/hooks/useProgress'
import { DownloadErrorOverlay } from '@renderer/overlays/DownloadErrorOverlay'
import { AddCard } from './AddCard'
import PageHeader from '@renderer/components/PageHeader'

/**
 * The `AppDownloads` component is responsible for rendering the downloads page of the application. It displays a list of available app downloads, allows users to upload their own app, and provides a link to the client downloads page.
 *
 * The component uses various hooks from the `useAppStore`, `useReleaseStore`, and `usePageStore` stores to manage the state and functionality of the page. It also uses several custom components, such as `Sidebar`, `Button`, and various overlay components.
 *
 * The main features of the `AppDownloads` component include:
 * - Displaying a list of available app downloads, with the ability to download the latest version of each app
 * - Allowing users to upload their own app by selecting a ZIP file
 * - Providing a link to the client downloads page
 * - Displaying download progress and success notifications
 * - Handling errors and edge cases, such as when the GitHub API limit is reached
 */
const AppDownloads: React.FC = () => {
  const appReleases = useReleaseStore((releaseStore) => releaseStore.appReleases)
  const getApps = useReleaseStore((releaseStore) => releaseStore.getApps)
  const refreshReleases = useReleaseStore((releaseStore) => releaseStore.refreshReleases)
  const stagedAppManifest = useAppStore((appStore) => appStore.stagedManifest)
  const addApp = useAppStore((appStore) => appStore.addApp)

  const [addAppError, setAddAppError] = useState<string | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const fetching = useRef(false)

  useChannelProgress(ProgressChannel.IPC_APPS)
  useChannelProgress(ProgressChannel.IPC_RELEASES)

  const [uiState, setUiState] = useState({
    showCommunity: false,
    refreshingApps: true
  })

  const [addAppRepoOverlay, setAddAppRepoOverlay] = useState(false)

  const setPage = usePageStore((pageStore) => pageStore.setPage)

  const gotoClientDownloads = (): void => {
    setPage('Downloads/Client')
  }

  const loadApps = useCallback(
    async (force = false): Promise<void> => {
      if (fetching.current) return
      fetching.current = true
      setUiState((prev) => ({ ...prev, refreshingApps: true }))
      setCatalogError(null)
      try {
        if (force) await refreshReleases(true)
        await getApps()
      } catch {
        setCatalogError(
          'Could not load app releases. Check your connection and repository, then try again.'
        )
      } finally {
        fetching.current = false
        setUiState((prev) => ({ ...prev, refreshingApps: false }))
      }
    },
    [getApps, refreshReleases]
  )

  useEffect(() => {
    void loadApps()
  }, [loadApps])

  const handleRefreshData = (): Promise<void> => loadApps(true)

  const onZipAdd = async (fileUrl: string): Promise<void> => {
    setAddAppError(null)
    try {
      const downloadResult = await addApp({ appPath: fileUrl })
      if (!downloadResult.success) {
        setAddAppError(downloadResult.message || 'Failed to add app from ZIP file.')
      }
    } catch {
      setAddAppError(
        'Could not import the app ZIP. Check that the file is accessible and try again.'
      )
    }
  }

  const handleToggleAddRepo = (): void => {
    setAddAppRepoOverlay((state) => !state)
  }

  return (
    <div className="flex h-full w-full">
      {addAppRepoOverlay && <AddRepoOverlay onClose={handleToggleAddRepo} onZipUpload={onZipAdd} />}
      {stagedAppManifest && <SuccessNotification stagedManifest={stagedAppManifest} />}
      <Sidebar className="flex justify-end flex-col h-full max-h-full md:items-stretch xs:items-center">
        <div>
          <div className="flex flex-col gap-2">
            <Button
              disabled={uiState.refreshingApps}
              onClick={handleRefreshData}
              className="hover:bg-zinc-900"
            >
              <IconRefresh
                className={`${uiState.refreshingApps ? 'animate-spin-smooth' : ''}`}
                strokeWidth={1.5}
              />
              <p className="md:block xs:hidden flex flex-grow xs:text-center">
                Refresh<span className="hidden group-disabled:inline">ing</span>
              </p>
            </Button>
            <Button onClick={handleToggleAddRepo} className="hover:bg-zinc-900">
              <IconPlus strokeWidth={1.5} />
              <p className="md:block xs:hidden xs:text-center flex-grow">Add App</p>
            </Button>
            <Button onClick={gotoClientDownloads} className="hover:bg-zinc-900">
              <IconLink strokeWidth={1.5} />
              <p className="md:block xs:hidden xs:text-center flex-grow">Clients</p>
            </Button>
          </div>
        </div>
      </Sidebar>
      <MainElement>
        <div className="page-scroll">
          <div className="page-frame">
            <PageHeader
              eyebrow="Downloads"
              title="App downloads"
              description="Browse and install DeskThing apps."
              actions={
                <>
                  <Button
                    disabled={uiState.refreshingApps}
                    onClick={handleRefreshData}
                    className="action-button"
                  >
                    <IconRefresh className={uiState.refreshingApps ? 'animate-spin-smooth' : ''} />
                    Refresh
                  </Button>
                  <Button
                    onClick={handleToggleAddRepo}
                    className="action-button action-button-primary"
                  >
                    <IconPlus />
                    Add app
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
              aria-busy={uiState.refreshingApps}
              className="w-full h-fit grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4"
            >
              {appReleases?.length > 0 ? (
                <>
                  {appReleases.map((appRelease, index) => (
                    <AppReleaseCard appReleaseServer={appRelease} key={appRelease.id || index} />
                  ))}
                  <AddCard />
                </>
              ) : (
                <div className="empty-state col-span-full">
                  <div className="max-w-md">
                    <div className="empty-state-icon">
                      <IconLayoutgrid iconSize={36} />
                    </div>
                    <h2 className="text-xl font-semibold tracking-tight">
                      {uiState.refreshingApps
                        ? 'Loading app releases'
                        : catalogError
                          ? 'Catalog unavailable'
                          : 'No app releases available'}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      {uiState.refreshingApps
                        ? 'Checking available apps…'
                        : 'Add a trusted repository or import an app ZIP to get started. If you already added a repository, refresh to check for releases.'}
                    </p>
                    <Button
                      onClick={handleRefreshData}
                      disabled={uiState.refreshingApps}
                      className="action-button action-button-primary mx-auto mt-5"
                    >
                      <IconRefresh
                        strokeWidth={1.5}
                        className={`${uiState.refreshingApps ? 'animate-spin-smooth' : ''}`}
                      />
                      <span>{uiState.refreshingApps ? 'Loading' : 'Refresh releases'}</span>
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
        {addAppError && (
          <DownloadErrorOverlay
            error={addAppError}
            onAcknowledge={() => setAddAppError(null)}
            title="There was an error loading the zip file"
          />
        )}
      </MainElement>
    </div>
  )
}

export default AppDownloads
