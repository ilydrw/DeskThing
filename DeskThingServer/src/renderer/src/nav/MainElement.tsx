import React from 'react'
import Papertrail from './Papertrail'
import ErrorBoundary from '@renderer/components/ErrorBoundary'
import { DownloadErrorOverlay } from '@renderer/overlays/DownloadErrorOverlay'

interface SidebarProps {
  children: React.ReactNode
  className?: string
}

const MainElement: React.FC<SidebarProps> = ({ children, className }) => {
  return (
    <ErrorBoundary
      fallback={(reset) => (
        <DownloadErrorOverlay
          error={`An unknown error occurred while loading this page.\nPlease try refreshing the page or restarting the application.`}
          title="Error Loading Page"
          onAcknowledge={reset}
          inset
        />
      )}
    >
      <main className="main-surface">
        <div className="flex flex-col h-full w-full absolute inset-0">
          <Papertrail />
          <div className={`h-full min-h-0 w-full overflow-hidden flex flex-col ${className || ''}`}>
            {children}
          </div>
        </div>
      </main>
    </ErrorBoundary>
  )
}

export default MainElement
