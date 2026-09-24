import React from 'react'
import { usePageStore, useSettingsStore } from '../stores/'
import { useSearchParams } from 'react-router-dom'

const Papertrail: React.FC = () => {
  const currentPage = usePageStore((pageStore) => pageStore.currentPage)
  const [searchParams] = useSearchParams()

  const is_nerd = useSettingsStore((state) => state.settings?.flag_nerd || false)

  const overlay = searchParams.entries().find(([_key, val]) => val === 'true')?.[0] || ''
  const page = searchParams.entries().find(([key]) => key === 'page')?.[1] || ''

  const trail = currentPage.split('/').filter(Boolean)

  if (!is_nerd) {
    return
  }

  return (
    <div className="papertrail w-full hxs:block hidden text-[10px] font-geistMono">
      {trail.map((item, index) => (
        <React.Fragment key={index}>
          <span>
            {index > 0 && ' > '}
            {item}
          </span>
        </React.Fragment>
      ))}
      {overlay && (
        <span>
          {' > '}
          <span>{overlay}</span>
          {page && (
            <span>
              {' > '}
              {page}
            </span>
          )}
        </span>
      )}
    </div>
  )
}

export default Papertrail
