import React from 'react'
import {
  IconConnected,
  IconDownload,
  IconLayoutgrid,
  IconLightning,
  IconLink,
  IconLogoGear,
  IconWifi
} from '@renderer/assets/icons'
import Button from '@renderer/components/Button'
import { useNavigate } from 'react-router-dom'
import { useAppStore, useClientStore } from '@renderer/stores'

const WelcomeWidget: React.FC = () => {
  const navigate = useNavigate()
  const connections = useClientStore((state) => state.connections)
  const clientManifest = useClientStore((state) => state.clientManifest)
  const initialized = useClientStore((state) => state.initialized)
  const installedApps = useAppStore((state) => state.appsList.length)
  const version = process.env.PACKAGE_VERSION

  return (
    <div className="dashboard-page">
      <div className="dashboard-frame">
        <header className="dashboard-header">
          <div>
            <p className="page-eyebrow">DeskThing</p>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-description">Manage devices, apps, and server status.</p>
          </div>
          <div className="page-header-actions">
            <Button onClick={() => navigate('/downloads/app')} className="action-button">
              <IconDownload />
              Browse apps
            </Button>
            <Button
              onClick={() => navigate('/clients/connections')}
              className="action-button action-button-primary"
            >
              <IconConnected className="fill-current" />
              Add device
            </Button>
          </div>
        </header>

        <section
          className="dashboard-status"
          aria-label="Device connection status"
          aria-live="polite"
        >
          <div className="dashboard-status-main">
            <span className="dashboard-status-icon">
              <IconLogoGear iconSize={22} />
            </span>
            <div>
              <p className="dashboard-status-title">
                {!initialized
                  ? 'Loading devices'
                  : connections > 0
                    ? 'Device connected'
                    : 'No connected devices'}
              </p>
              <p className="dashboard-status-detail">
                {connections === 0
                  ? 'Open Devices to connect a display or troubleshoot its connection.'
                  : `${connections} device${connections === 1 ? '' : 's'} connected`}
              </p>
            </div>
          </div>
          <span className={`dashboard-status-badge ${connections === 0 ? '!text-amber-300' : ''}`}>
            <span
              className={`connection-pill-dot ${connections === 0 ? '!bg-amber-300 !shadow-none' : ''}`}
            />
            {connections > 0 ? 'Connected' : 'Not connected'}
          </span>
        </section>

        {initialized && !clientManifest && (
          <section className="dashboard-status" aria-label="Set up device software">
            <div>
              <h2 className="dashboard-status-title">Install device software first</h2>
              <p className="dashboard-status-detail">
                Your display needs a DeskThing client. Open device software to add a trusted client
                repository or import a client ZIP, then connect your display from Devices.
              </p>
            </div>
            <Button className="action-button" onClick={() => navigate('/downloads/client')}>
              Device software
            </Button>
          </section>
        )}

        <section className="dashboard-grid" aria-label="DeskThing overview">
          <button
            type="button"
            className="dashboard-card"
            onClick={() => navigate('/clients/connections')}
          >
            <span className="dashboard-card-icon">
              <IconWifi iconSize={18} />
            </span>
            <strong className="dashboard-metric">{connections}</strong>
            <span className="dashboard-card-label">
              {connections === 1 ? 'Connected device' : 'Connected devices'}
            </span>
          </button>

          <button type="button" className="dashboard-card" onClick={() => navigate('/apps/list')}>
            <span className="dashboard-card-icon">
              <IconLayoutgrid iconSize={18} />
            </span>
            <strong className="dashboard-metric">{installedApps}</strong>
            <span className="dashboard-card-label">
              {installedApps === 1 ? 'Installed app' : 'Installed apps'}
            </span>
          </button>

          <button
            type="button"
            className="dashboard-card"
            onClick={() => navigate('/downloads/client')}
          >
            <span className="dashboard-card-icon">
              <IconLightning iconSize={18} />
            </span>
            <strong className="dashboard-metric">Client</strong>
            <span className="dashboard-card-label">Manage device software</span>
          </button>

          <button
            type="button"
            className="dashboard-card"
            onClick={() => navigate('?notifications=true&page=task')}
          >
            <span className="dashboard-card-icon">
              <IconLink iconSize={18} />
            </span>
            <strong className="dashboard-metric">v{version}</strong>
            <span className="dashboard-card-label">Current server version</span>
          </button>
        </section>
      </div>
    </div>
  )
}

export default WelcomeWidget
