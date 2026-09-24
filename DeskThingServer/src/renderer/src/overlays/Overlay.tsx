import { IconX } from '@renderer/assets/icons'
import Button from '@renderer/components/Button'
import ErrorBoundary from '@renderer/components/ErrorBoundary'
import FeedbackButton from '@renderer/components/FeedbackButton'
import React, { useRef, useEffect, useState, useMemo } from 'react'

interface DownloadConfirmationProps {
  onClose: () => void
  className?: string
  showFeedbackButton?: boolean
  children: React.ReactNode
}

const Overlay: React.FC<DownloadConfirmationProps> = ({
  onClose,
  className,
  children,
  showFeedbackButton = true
}) => {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [isClosing, setIsClosing] = useState(false)

  const handleClose = (): void => {
    setIsClosing(true)
    setTimeout(() => {
      onClose()
    }, 200)
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (overlayRef.current && !overlayRef.current.contains(event.target as Node)) {
        handleClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [handleClose])

  const memoChildren = useMemo(() => children, [children])

  return (
    <div
      className={`overlay-backdrop fixed ${isClosing ? 'animate-fade-out' : 'animate-fade'} inset-0 flex items-center justify-center z-50 p-4`}
    >
      <div ref={overlayRef} className={`overlay-surface relative ${className || ''}`}>
        <div className="absolute top-3 right-3 z-20 w-fit h-fit flex gap-1">
          {showFeedbackButton && (
            <FeedbackButton onClick={handleClose} className="action-button !p-2" showText={false} />
          )}
          <Button title="Close Window" className="action-button !p-2" onClick={handleClose}>
            <IconX />
          </Button>
        </div>
        <ErrorBoundary>{memoChildren}</ErrorBoundary>
      </div>
    </div>
  )
}

export default Overlay
