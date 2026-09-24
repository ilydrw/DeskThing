import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import useUpdateStore from '@renderer/stores/updateStore'
import useTaskStore from '@renderer/stores/taskStore'
import { useNotificationStore, useSettingsStore } from '@renderer/stores'
import ProgressPopup from '../ProgressPopup'

const QROverlay = lazy(() => import('@renderer/overlays/modals/QROverlay'))
const SettingsOverlay = lazy(() => import('../settings/SettingsOverlay'))
const NotificationOverlay = lazy(() => import('../notifications/NotificationOverlay'))
const AppsOverlay = lazy(() => import('../apps/AppsOverlay'))
const AddProfileOverlay = lazy(() => import('./AddProfile.'))
const UpdateOverlay = lazy(() => import('../UpdateOverlay'))
const TaskOverlay = lazy(() => import('./TaskOverlay'))
const FeedbackOverlay = lazy(() => import('./FeedbackOverlay'))
const SetupOverlay = lazy(() => import('../setup/SetupOverlay'))
const LinkRequestOverlay = lazy(() => import('./LinkRequestOverlay'))
const ViewProgressLogs = lazy(() => import('./ViewProgressLogs'))
const AddReleaseModal = lazy(() => import('../releases/AddReleaseOverlay'))
const AvailableNotificationOverlay = lazy(() => import('../AvailableNotificationOverlay'))

const overlays = {
  qr: QROverlay,
  settings: SettingsOverlay,
  notifications: NotificationOverlay,
  app: AppsOverlay,
  addProfile: AddProfileOverlay,
  feedback: FeedbackOverlay,
  setup: SetupOverlay,
  progress: ViewProgressLogs,
  addrepo: AddReleaseModal
}

const OverlayWrapper: React.FC<React.PropsWithChildren> = ({
  children
}: React.PropsWithChildren) => {
  const [searchParams] = useSearchParams()
  const [activeOverlays, setActiveOverlays] = useState<string[]>([])
  const update = useUpdateStore((state) => state.update)
  const currentTask = useTaskStore((state) => state.currentTask)
  const activeRequests = useSettingsStore((state) => state.activeRequests)
  const notifications = useNotificationStore((state) => state.messages)

  useEffect(() => {
    console.log('Current search params:', Object.fromEntries(searchParams))
    const newActiveOverlays = Object.keys(overlays).filter(
      (key) => searchParams.get(key) === 'true'
    )
    setActiveOverlays(newActiveOverlays)
  }, [searchParams])

  const memoizedChildren = useMemo(() => children, [children])

  return (
    <>
      {activeRequests && activeRequests.length > 0 && (
        <Suspense fallback={null}>
          <LinkRequestOverlay />
        </Suspense>
      )}
      {(update.updateAvailable || update.updateDownloaded) && (
        <Suspense fallback={null}>
          <UpdateOverlay />
        </Suspense>
      )}
      {Object.keys(notifications).length > 0 && (
        <Suspense fallback={null}>
          <AvailableNotificationOverlay />
        </Suspense>
      )}
      {activeOverlays.map((key) => {
        const OverlayComponent = overlays[key as keyof typeof overlays]
        return (
          <Suspense fallback={null} key={key}>
            <OverlayComponent />
          </Suspense>
        )
      })}
      <ProgressPopup />
      {memoizedChildren}
      {currentTask && (
        <Suspense fallback={null}>
          <TaskOverlay />
        </Suspense>
      )}
    </>
  )
}

export default OverlayWrapper
