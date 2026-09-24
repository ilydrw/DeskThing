import React from 'react'
import Nav from './Nav'
import { IconLogoGear, IconWifi } from '@renderer/assets/icons'
import { useClientStore } from '@renderer/stores'

const TopBar: React.FC = () => {
  const connections = useClientStore((state) => state.connections)
  const version = process.env.PACKAGE_VERSION
  return (
    <header className="topbar-shell">
      <div className="topbar-brand">
        <div className="topbar-brand-mark">
          <IconLogoGear iconSize={22} />
        </div>
        <strong className="topbar-wordmark">DeskThing</strong>
      </div>
      <div className="min-w-0 w-full">
        <Nav />
      </div>
      <div className="topbar-status">
        <div
          className="connection-pill"
          title={`${connections} connected device${connections === 1 ? '' : 's'}`}
        >
          <span
            className={`connection-pill-dot ${connections === 0 ? '!bg-amber-300 !shadow-none' : ''}`}
          />
          <span className="connection-pill-label">
            {connections > 0 ? `${connections} connected` : 'No devices connected'}
          </span>
          <IconWifi
            className={connections > 0 ? 'text-emerald-400' : 'text-zinc-600'}
            iconSize={16}
          />
        </div>
        <span className="version-pill hidden xl:inline font-geistMono text-[10px] text-slate-600">
          v{version}
        </span>
      </div>
    </header>
  )
}

export default TopBar
