import React, { useState } from 'react'
import NotificationButton from '../components/NotificationButton'
import SettingsButton from '../components/SettingsButton'
import Button from '@renderer/components/Button'
import { IconArrowLeft } from '@renderer/assets/icons'
import FeedbackButton from '@renderer/components/FeedbackButton'
import ErrorBoundary from '@renderer/components/ErrorBoundary'

interface SidebarProps {
  children: React.ReactNode
  className?: string
}

const Sidebar: React.FC<SidebarProps> = ({ children, className }) => {
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(false)

  return (
    <div className={`sidebar-shell ${sidebarVisible ? 'sidebar-open' : ''} ${className || ''}`}>
      <nav className="sidebar-content" aria-label="Page tools">
        <div className="w-full h-full relative overflow-y-auto overflow-x-hidden">
          <ErrorBoundary>
            <div className="h-full flex flex-col absolute w-full">{children}</div>
          </ErrorBoundary>
        </div>
        <div className="sidebar-tools min-h-fit flex-shrink-0">
          <div>
            <FeedbackButton />
          </div>
          <div>
            <NotificationButton />
          </div>
          <div>
            <SettingsButton />
          </div>
        </div>
      </nav>
      <div className="absolute top-3 right-0 translate-x-12 xs:hidden">
        <Button
          title={`${sidebarVisible ? 'Hide' : 'Show'} Sidebar`}
          onClick={() => setSidebarVisible((state) => !state)}
          className="action-button bg-slate-950/90"
        >
          <IconArrowLeft className={`${!sidebarVisible && 'rotate-180'}`} />
        </Button>
      </div>
    </div>
  )
}

export default Sidebar
