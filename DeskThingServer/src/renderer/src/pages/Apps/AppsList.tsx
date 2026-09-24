import React, { useEffect, useMemo, useState } from 'react'
import Sidebar from '@renderer/nav/Sidebar'
import Button from '@renderer/components/Button'
import { IconDownload, IconLayoutgrid, IconLink } from '@renderer/assets/icons'
import { useAppStore, useNotificationStore, usePageStore } from '@renderer/stores'
import App from '@renderer/components/App'
import MainElement from '@renderer/nav/MainElement'
import { useChannelProgress } from '@renderer/hooks/useProgress'
import { ProgressChannel } from '@shared/types'
import PageHeader from '@renderer/components/PageHeader'

/**
 * The `AppsList` component is the main component that renders the list of installed apps in the application.
 * It fetches the list of apps from the app store, displays them in a scrollable list, and allows the user to
 * reorder the apps by dragging and dropping them.
 *
 * The component also includes a sidebar with a button to navigate to the downloads page.
 */
const AppsList: React.FC = () => {
  useChannelProgress(ProgressChannel.IPC_APPS)
  const appsList = useAppStore((appStore) => appStore.appsList)
  const order = useAppStore((appStore) => appStore.order)
  const setOrder = useAppStore((appStore) => appStore.setOrder)
  const setPage = usePageStore((pageStore) => pageStore.setPage)
  const requests = useNotificationStore((notificationStore) => notificationStore.requestQueue)
  const [activeRequests, setActiveRequests] = useState<string[]>([])
  const [draggedAppHeight, setDraggedAppHeight] = useState<number>(0)

  const [draggedApp, setDraggedApp] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const handleDownloadsNav = (): void => {
    setPage('Downloads/App')
  }

  const apps = useMemo(() => {
    return order.map((appName) => appsList.find((app) => app.name === appName)).filter(Boolean)
  }, [order, appsList])

  useEffect(() => {
    setActiveRequests(requests.map((request) => request.appName))
  }, [requests])

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, appName: string): void => {
    setDraggedApp(appName)
    setDraggedAppHeight(e.currentTarget.clientHeight)
    // Create a custom drag image
    const dragImage = e.currentTarget.cloneNode(true) as HTMLElement
    dragImage.style.opacity = '1'
    dragImage.style.position = 'fixed'
    dragImage.style.top = '-1000px'
    dragImage.style.width = `${e.currentTarget.offsetWidth}px`
    document.body.appendChild(dragImage)
    e.dataTransfer.setDragImage(dragImage, 0, 0)

    // Clean up the drag image after dragging
    requestAnimationFrame(() => {
      document.body.removeChild(dragImage)
    })
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number): void => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDragLeave = (): void => {
    setDragOverIndex(null)
  }

  const handleDrop = (targetAppName: string): void => {
    if (draggedApp && draggedApp !== targetAppName) {
      const newOrder = [...order]
      const draggedIndex = newOrder.indexOf(draggedApp)
      const targetIndex = newOrder.indexOf(targetAppName)
      newOrder.splice(draggedIndex, 1)
      newOrder.splice(targetIndex, 0, draggedApp)
      setOrder(newOrder)
    }
    setDraggedApp(null)
    setDragOverIndex(null)
  }

  return (
    <div className="flex h-full w-full">
      <Sidebar>
        <div className="flex flex-col gap-2">
          <Button onClick={handleDownloadsNav}>
            <IconDownload strokeWidth={1.5} />
            <p className="xs:hidden md:block block text-center flex-grow">Download</p>
          </Button>
        </div>
      </Sidebar>
      <MainElement>
        <div className="page-scroll">
          <div className="page-frame">
            <PageHeader
              eyebrow="Apps"
              title="Installed apps"
              description="Manage apps running on connected devices."
              actions={
                <Button
                  onClick={handleDownloadsNav}
                  className="action-button action-button-primary"
                >
                  <IconDownload strokeWidth={1.5} />
                  Browse apps
                </Button>
              }
            />
            {apps ? (
              apps.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {apps.map(
                    (app, index) =>
                      app && (
                        <div
                          key={app.name}
                          draggable
                          onDragStart={(e) => handleDragStart(e, app.name)}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDragLeave={handleDragLeave}
                          onDrop={() => handleDrop(app.name)}
                          className={`relative transition-all duration-75
                        ${draggedApp === app.name ? 'opacity-50' : ''}`}
                        >
                          <div
                            style={{
                              height:
                                index !== order.length - 1 && dragOverIndex === index
                                  ? draggedAppHeight + 'px'
                                  : '0px'
                            }}
                            className={`rounded-lg bg-emerald-400/10 transition-all ${dragOverIndex === index ? 'mb-2' : ''}`}
                          />
                          <App app={app} activeRequest={activeRequests.includes(app.name)} />
                          {index === order.length - 1 && dragOverIndex === index && (
                            <div className="h-[100px]"></div>
                          )}
                        </div>
                      )
                  )}
                </div>
              ) : (
                // Shows when the AppsList is initialized but empty
                <div className="empty-state">
                  <div className="max-w-md">
                    <div className="empty-state-icon">
                      <IconLayoutgrid iconSize={36} />
                    </div>
                    <h2 className="text-xl font-semibold tracking-tight text-slate-100">
                      No apps installed
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Browse available apps or add one from a local ZIP file.
                    </p>
                    <Button
                      onClick={handleDownloadsNav}
                      className="action-button action-button-primary mx-auto mt-5"
                    >
                      Browse apps
                      <IconLink strokeWidth={1.5} />
                    </Button>
                  </div>
                </div>
              )
            ) : (
              // Shows while retrieving the apps list from the store
              <div className="empty-state text-sm text-zinc-500">Loading apps…</div>
            )}
          </div>
        </div>
      </MainElement>
    </div>
  )
}

export default AppsList
