import { IconGear } from '@renderer/assets/icons'
import React from 'react'
import Button from './Button'
import { useSearchParams } from 'react-router-dom'

const SettingsButton: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const buttonRef = React.useRef<HTMLButtonElement>(null)

  const handleOpenSettings = (): void => {
    searchParams.set('settings', 'true')
    setSearchParams(searchParams)
  }

  return (
    <>
      <Button title="App Settings" className="" onClick={handleOpenSettings} ref={buttonRef}>
        <IconGear iconSize={24} strokeWidth={2} />
        <p className="flex-grow text-left text-sm md:block hidden">Settings</p>
      </Button>
    </>
  )
}

export default SettingsButton
