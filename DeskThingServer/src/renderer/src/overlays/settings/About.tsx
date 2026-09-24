import React, { useState, useEffect } from 'react'
import Button from '@renderer/components/Button'
import { Member, Supporter } from '@shared/types/supporter'
import User from '@renderer/components/supporter/User'

import riprodAvatar from '@renderer/assets/images/authors/riprod.gif'
import thebigloudAvatar from '@renderer/assets/images/authors/thebigloud.webp'

const AboutSettings: React.FC = () => {
  const [supporters, setSupporters] = useState<{ monthly: Member[]; onetime: Supporter[] }>({
    monthly: [],
    onetime: []
  })
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    const fetchSupporters = async (): Promise<void> => {
      try {
        setLoading(true)
        const response = await window.electron.utility.getSupporters({
          force: false,
          page: currentPage
        })
        if (response.items && response.items.length > 0) {
          setSupporters(response.items[0])
          setTotalPages(response.totalPages)
        }
        setLoading(false)
      } catch (error) {
        console.error('Error fetching supporters:', error)
        setSupporters({ monthly: [], onetime: [] })
        setLoading(false)
      }
    }

    fetchSupporters()
  }, [currentPage])

  return (
    <div className="absolute inset w-full h-full p-6 overflow-y-auto bg-zinc-950/20">
      <div className="w-full flex flex-col gap-6 max-w-4xl mx-auto">
        <div className="flex flex-col md:flex-row gap-6 items-center mb-2">
          <div className="w-full border border-zinc-800 bg-zinc-950/30 p-5 rounded-xl">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">DeskThing</h1>
            <p className="text-zinc-400 mt-1 text-sm">
              Open-source software for connected displays.
            </p>
          </div>
        </div>

        <div>
          <h1 className="text-lg">Original Project Credits</h1>
          <User
            avatar={riprodAvatar}
            name="Riprod"
            contribution="Original creator and lead developer"
          />
          <User avatar={thebigloudAvatar} name="TheBigLoud" contribution="Original UI designer" />
        </div>

        <div className="flex md:flex-row flex-col gap-4">
          <div className="w-full">
            <h1 className="text-lg">Monthly Supporters</h1>
            {loading ? (
              <div className="flex items-center justify-center p-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                <span className="ml-2 text-emerald-400">Loading supporters...</span>
              </div>
            ) : supporters.monthly && supporters.monthly.length > 0 ? (
              supporters.monthly.map((supporter) => (
                <User
                  key={supporter.supporterId}
                  name={supporter.name}
                  contribution={`${supporter.num_coffees} coffee${supporter.num_coffees > 1 ? 's' : ''} - ${supporter.message || ''}`}
                />
              ))
            ) : (
              <div className="text-center py-3 text-zinc-500 italic">No monthly supporters yet</div>
            )}
          </div>
          <div className="w-full">
            <h1 className="text-lg">One Time Supporters</h1>
            {loading ? (
              <div className="flex items-center justify-center p-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                <span className="ml-2 text-emerald-400">Loading supporters...</span>
              </div>
            ) : supporters.onetime && supporters.onetime.length > 0 ? (
              supporters.onetime.map((supporter) => (
                <User
                  key={supporter.supporterId}
                  name={supporter.name}
                  contribution={`${supporter.num_coffees} coffee${supporter.num_coffees > 1 ? 's' : ''} - ${supporter.message || ''}`}
                />
              ))
            ) : (
              <div className="text-center py-3 text-zinc-500 italic">
                No one-time supporters yet
              </div>
            )}
          </div>
        </div>

        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-4">
            <Button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className={`action-button px-4 py-2 font-medium ${
                currentPage === 1
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-white'
              }`}
            >
              Previous
            </Button>
            <span className="flex items-center px-4 bg-zinc-800/50 rounded-md text-emerald-300 border border-zinc-700">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className={`action-button px-4 py-2 font-medium ${
                currentPage === totalPages
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-white'
              }`}
            >
              Next
            </Button>
          </div>
        )}

        <div className="text-center text-zinc-500 text-sm p-4 mt-4 border-t border-zinc-800">
          <p>
            Community fork based on the original MIT-licensed DeskThing project by Riprod. Support
            links will be added only after this fork has its own accountable project ownership.
          </p>
        </div>
      </div>
    </div>
  )
}

export default AboutSettings
