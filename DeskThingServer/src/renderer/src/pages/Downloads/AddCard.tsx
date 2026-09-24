import { IconLoading, IconPlus } from '@renderer/assets/icons'
import { FC } from 'react'
import { useSearchParams } from 'react-router-dom'

export const AddCard: FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()

  const handleShowReleaseModal = (): void => {
    searchParams.set('addrepo', 'true')
    setSearchParams(searchParams)
  }

  return (
    <>
      <div className="download-card w-full h-full min-h-40 relative flex-grow flex items-center justify-center border border-dashed rounded-xl transition-colors duration-150 group">
        {searchParams.get('addrepo') === 'true' ? (
          <div>
            <IconLoading className="w-16 h-16 text-zinc-300" />
          </div>
        ) : (
          <>
            <button
              onClick={handleShowReleaseModal}
              className="relative w-full h-full flex flex-col items-center justify-center focus:outline-none"
            >
              <span className="grid h-12 w-12 place-items-center rounded-lg border border-zinc-700 bg-zinc-950/40 text-emerald-400">
                <IconPlus className="w-6 h-6" />
              </span>
              <span className="mt-3 text-sm font-medium text-zinc-400">Add repository</span>
            </button>
          </>
        )}
      </div>
    </>
  )
}
