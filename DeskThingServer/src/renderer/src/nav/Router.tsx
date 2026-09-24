import { HashRouter as Router, Route, Routes, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import Loading from '../components/Loading'
import TopBar from './TopBar'
import PageDataListener from '@renderer/listeners/PageDataListener'
import OverlayWrapper from '@renderer/overlays/modals/OverlaysWrapper'
import ServerRoutingListener from '@renderer/listeners/ServerRouteListener'
import ErrorBoundary from '@renderer/components/ErrorBoundary'

const Clients = lazy(() => import('@renderer/pages/Clients'))
const Apps = lazy(() => import('@renderer/pages/Apps'))
const Downloads = lazy(() => import('@renderer/pages/Downloads'))
const Dev = lazy(() => import('@renderer/pages/Dev'))
const ClientMappingPage = lazy(() => import('@renderer/pages/Clients/Mapping/'))
const AppsList = lazy(() => import('@renderer/pages/Apps/AppsList'))
const AppDownloads = lazy(() => import('@renderer/pages/Downloads/AppDownloads'))
const ClientDownloads = lazy(() => import('@renderer/pages/Downloads/ClientDownloads'))
const Logs = lazy(() => import('@renderer/pages/Dev/Logs'))
const ClientConnections = lazy(() => import('@renderer/pages/Clients/Connections'))
const WelcomeWidget = lazy(() => import('@renderer/pages/Dashboard/WelcomeWidget'))
const ADBSettings = lazy(() => import('@renderer/pages/Dev/ADBSettings'))
const ClientTheming = lazy(() => import('@renderer/pages/Clients/Theming'))
const ProfilesPage = lazy(() => import('@renderer/pages/Clients/profiles'))
const DevAppPage = lazy(() => import('@renderer/pages/Dev/DevApp/DevAppPage'))

const AppRouter = (): JSX.Element => {
  return (
    <Router>
      <OverlayWrapper>
        <PageDataListener />
        <ServerRoutingListener />
        <div className="flex flex-col h-full">
          <TopBar />
          <ErrorBoundary>
            <Suspense fallback={<Loading message="Loading page..." />}>
              <Routes>
                <Route path="/" element={<Loading />} />
                <Route path="/da" element={<Navigate to="/dashboard" replace />} />
                <Route path="/do" element={<Navigate to="/downloads/client" replace />} />
                <Route path="/de" element={<Navigate to="/developer/logs" replace />} />
                <Route path="/cl" element={<Navigate to="/clients/connections" replace />} />
                <Route path="/ap" element={<Navigate to="/apps/list" replace />} />

                <Route path="/dashboard" element={<WelcomeWidget />} />
                <Route path="/clients" element={<Clients />}>
                  <Route path="mapping" element={<ClientMappingPage />} />
                  <Route path="theming" element={<ClientTheming />} />
                  <Route path="connections" element={<ClientConnections />} />
                  <Route path="Profiles" element={<ProfilesPage />} />
                </Route>
                <Route path="/apps" element={<Apps />}>
                  <Route path="list" element={<AppsList />} />
                </Route>
                <Route path="/downloads" element={<Downloads />}>
                  <Route path="app" element={<AppDownloads />} />
                  <Route path="client" element={<ClientDownloads />} />
                </Route>
                <Route path="/developer" element={<Dev />}>
                  <Route path="logs" element={<Logs />} />
                  <Route path="app" element={<DevAppPage />} />
                  <Route path="adb" element={<ADBSettings />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </div>
      </OverlayWrapper>
    </Router>
  )
}

export default AppRouter
