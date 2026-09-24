import React, { useState, useRef, useEffect } from 'react'
import usePageStore from '../stores/pageStore'
import {
  IconCarThingSmall,
  IconDownload,
  IconHome,
  IconLayoutgrid,
  IconWrench
} from '@renderer/assets/icons'
import { useSettingsStore } from '@renderer/stores'

const Nav: React.FC = () => {
  const currentPage = usePageStore((pageStore) => pageStore.currentPage)
  const is_nerd = useSettingsStore((state) => state.settings?.flag_nerd || false)
  const setPage = usePageStore((pageStore) => pageStore.setPage)
  const handleNavigation = (path: string): void => {
    setPage(path)
  }

  return (
    <nav className="nav-shell text-neutral-200 w-full" aria-label="Primary navigation">
      <ul className={`grid ${is_nerd ? 'grid-cols-5' : 'grid-cols-4'} gap-1`}>
        <li className="w-full h-full group">
          <NavButton
            location="Dashboard"
            currentPage={currentPage}
            handleNavigation={handleNavigation}
          >
            <IconHome iconSize={20} />
            <span>Home</span>
          </NavButton>
        </li>
        <li className="w-full h-full group">
          <NavButton
            location="Clients"
            currentPage={currentPage}
            handleNavigation={handleNavigation}
            subDirectories={['Connections', 'Mapping', 'Profiles']}
          >
            <IconCarThingSmall iconSize={20} />
            <span>Devices</span>
          </NavButton>
        </li>
        <li className="w-full h-full group">
          <NavButton
            location="Apps/List"
            currentPage={currentPage}
            handleNavigation={handleNavigation}
          >
            <IconLayoutgrid iconSize={20} />
            <span>Apps</span>
          </NavButton>
        </li>
        <li className="w-full h-full group">
          <NavButton
            location="Downloads"
            currentPage={currentPage}
            handleNavigation={handleNavigation}
            subDirectories={['App', 'Client']}
          >
            <IconDownload iconSize={20} />
            <span>Downloads</span>
          </NavButton>
        </li>
        {is_nerd && (
          <li className="w-full h-full group">
            <NavButton
              location="Developer"
              currentPage={currentPage}
              handleNavigation={handleNavigation}
              subDirectories={['Logs', 'App', 'ADB']}
            >
              <IconWrench iconSize={20} />
              <span>Developer</span>
            </NavButton>
          </li>
        )}
      </ul>
    </nav>
  )
}

interface NavProps {
  location: string
  currentPage: string
  handleNavigation: (path: string) => void
  subDirectories?: string[]
  children?: React.ReactNode
}

const NavButton = ({
  location,
  currentPage,
  handleNavigation,
  subDirectories,
  children
}: NavProps): JSX.Element => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const handleClick = (): void => {
    if (currentPage.includes(location)) {
      setIsOpen(!isOpen)
      return
    }

    if (subDirectories && subDirectories.length > 0) {
      setIsOpen(!isOpen)
      handleNavigation('/' + location + '/' + subDirectories[0])
    } else {
      handleNavigation('/' + location)
    }
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    } else {
      document.removeEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleClick}
        className={`nav-button ${currentPage.toLowerCase().includes(location.toLowerCase()) ? 'nav-button-active' : ''}`}
      >
        {children}
      </button>
      <div
        className={`${isOpen ? 'max-h-[500px]' : 'max-h-0'} left-0 right-0 absolute transition-[max-height] duration-300 ease-in-out z-40 overflow-visible`}
      >
        {subDirectories && subDirectories.length > 0 && isOpen && (
          <div className="nav-dropdown">
            {subDirectories.map((subDir) => (
              <button
                key={subDir}
                onClick={() => handleNavigation(`/${location}/${subDir}`)}
                className={`p-2 w-full text-left ${currentPage.toLowerCase().includes(subDir.toLowerCase()) ? 'nav-dropdown-active' : ''}`}
              >
                {subDir}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Nav
