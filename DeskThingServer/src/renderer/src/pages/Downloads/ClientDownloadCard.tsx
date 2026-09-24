import { ClientLatestJSONLatest } from '@deskthing/types'
import { IconDownload, IconExpand, IconLoading, IconLogoGear } from '@renderer/assets/icons'
import Button from '@renderer/components/Button'
import { DownloadErrorOverlay } from '@renderer/overlays/DownloadErrorOverlay'
import { ClientReleaseHistoryModal } from '@renderer/overlays/releases/ClientReleaseOverlay'
import { useClientStore, useReleaseStore, useSettingsStore } from '@renderer/stores'
import { ClientLatestServer, PastReleaseInfo } from '@shared/types'
import { FC, useState } from 'react'

type ClientDownloadCardProps = {
  clientRelease: ClientLatestServer
  loading: boolean
  setLoading: (loading: boolean) => void
}

export const ClientDownloadCard: FC<ClientDownloadCardProps> = ({
  clientRelease,
  loading,
  setLoading
}) => {
  const [showPastReleases, setShowPastReleases] = useState<boolean>(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const isNerd = useSettingsStore((state) => state.settings.flag_nerd)

  const downloadClient = useReleaseStore((releaseStore) => releaseStore.downloadClient)
  const loadClientUrl = useClientStore((clientStore) => clientStore.loadClientUrl)
  const removeClientRelease = useReleaseStore((releaseStore) => releaseStore.removeClientRelease)

  const handleRemove = (): Promise<void> => {
    return removeClientRelease(clientRelease.id)
  }

  const formatSize = (size: number): string => {
    if (size < 1024) {
      return `${size} B`
    } else if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(2)} KB`
    } else {
      return `${(size / (1024 * 1024)).toFixed(2)} MB`
    }
  }

  const handleDownload = async (
    release: ClientLatestJSONLatest | PastReleaseInfo
  ): Promise<void> => {
    setLoading(true)
    try {
      if ('meta_type' in release) {
        const result = await downloadClient(release.clientManifest.id)
        if (!result.success) {
          setDownloadError(result.message || 'Unknown error during download')
        }
      } else {
        const downloadResult = await loadClientUrl(release.download_url)
        if (!downloadResult.success) {
          setDownloadError(downloadResult.message || 'Unknown error during download')
        }
      }
    } catch (error) {
      console.error('Failed to download client:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleShowPastReleases = (): void => {
    setShowPastReleases(!showPastReleases)
  }

  const latestRelease = clientRelease.mainRelease

  return (
    <div>
      <div className="download-card w-full flex-grow relative p-4 border rounded-xl transition-colors duration-150 group">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center">
            <IconLoading className="w-16 h-16 text-emerald-300 animate-spin-smooth" />
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="absolute top-2 right-2">
              <Button
                title="View history"
                onClick={handleShowPastReleases}
                className="action-button !p-2 flex items-center justify-center"
              >
                <IconExpand />
              </Button>
            </div>
            <button onClick={handleShowPastReleases} className="w-full h-full">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-lg border border-zinc-800 bg-zinc-950/40 flex items-center justify-center">
                  <IconLogoGear className="w-10 h-10 text-emerald-400" />
                </div>
              </div>
              <div className="text-center mb-4">
                <h3 className="text-base font-semibold mb-1 text-zinc-100">
                  {latestRelease?.clientManifest?.name ||
                    latestRelease?.clientManifest?.id ||
                    'Unknown Client'}
                </h3>
                <div className="text-xs leading-5 text-zinc-500">
                  <div>Version {latestRelease?.clientManifest?.version || 'N/A'}</div>
                  <div>{clientRelease?.totalDownloads?.toLocaleString() || 0} downloads</div>
                  {latestRelease?.clientManifest?.author && (
                    <div>Written By {latestRelease.clientManifest.author}</div>
                  )}
                </div>
              </div>
            </button>
            <div className="w-full space-y-2">
              <Button
                title="Download Latest"
                onClick={() => handleDownload(latestRelease)}
                className="action-button action-button-primary w-full gap-2 justify-center"
                disabled={loading}
              >
                <p>Download latest</p>
                <IconDownload />
              </Button>
              {isNerd && (
                <div className="text-xs text-zinc-400 text-center">
                  {latestRelease?.size ? formatSize(latestRelease.size) : 'N/A'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {showPastReleases && (
        <ClientReleaseHistoryModal
          onClose={handleShowPastReleases}
          onDownload={handleDownload}
          onRemove={handleRemove}
          clientReleaseServer={clientRelease}
        />
      )}
      {downloadError && (
        <DownloadErrorOverlay
          error={downloadError}
          onAcknowledge={() => setDownloadError(null)}
          title={`Failed to load Client: ${latestRelease?.clientManifest?.name || 'Unknown Client'}`}
        />
      )}
    </div>
  )
}
