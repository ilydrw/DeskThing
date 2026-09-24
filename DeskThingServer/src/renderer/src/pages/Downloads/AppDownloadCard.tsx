import { AppLatestJSONLatest } from '@deskthing/types'
import { IconDownload, IconExpand, IconLoading, IconLogoGear } from '@renderer/assets/icons'
import Button from '@renderer/components/Button'
import { DownloadErrorOverlay } from '@renderer/overlays/DownloadErrorOverlay'
import { AppReleaseHistoryModal } from '@renderer/overlays/releases/AppReleaseOverlay'
import { useAppStore, useReleaseStore } from '@renderer/stores'
import { AppLatestServer, PastReleaseInfo } from '@shared/types'
import { FC, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

type AppReleaseCardProps = {
  appReleaseServer: AppLatestServer
}

export const AppReleaseCard: FC<AppReleaseCardProps> = ({ appReleaseServer }) => {
  const [searchParams, setSearchParams] = useSearchParams()

  const downloadApp = useReleaseStore((releaseStore) => releaseStore.downloadApp)
  const addStagedManifest = useAppStore((appStore) => appStore.setStagedManifest)
  const addApp = useAppStore((appStore) => appStore.addApp)
  const removeAppRelease = useReleaseStore((releaseStore) => releaseStore.removeAppRelease)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const [isLoading, setIsLoading] = useState(false)

  const handleRemove = (): Promise<void> => {
    return removeAppRelease(appReleaseServer.id)
  }

  const handleDownload = async (asset: AppLatestJSONLatest | PastReleaseInfo): Promise<void> => {
    setDownloadError(null)
    setIsLoading(true)
    if ('meta_type' in asset) {
      const appReturnData = await downloadApp(asset.appManifest.id)
      if (appReturnData.success) {
        addStagedManifest(appReturnData.appManifest)
      } else {
        setDownloadError(appReturnData.message || 'Unknown error during download')
      }
    } else {
      const manifest = await addApp({ appPath: asset.download_url })
      if (manifest.success) {
        addStagedManifest(manifest.appManifest)
      } else {
        setDownloadError(manifest.message || 'Unknown error during download')
      }
    }
    setIsLoading(false)
  }

  const handleShowPastReleases = (): void => {
    const currentId = searchParams.get('download_page')
    if (currentId === latestRelease.appManifest.id) {
      searchParams.delete('download_page')
    } else {
      searchParams.set('download_page', latestRelease.appManifest.id)
    }
    setSearchParams(searchParams)
  }

  const latestRelease = appReleaseServer.mainRelease

  return (
    <>
      <div className="download-card w-full relative p-4 border rounded-xl transition-colors duration-150 group">
        {isLoading ? (
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
                {latestRelease?.icon ? (
                  <img
                    src={latestRelease.icon}
                    alt={latestRelease.appManifest?.label || 'App icon'}
                    className="w-16 h-16 rounded-lg object-cover invert"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg border border-zinc-800 bg-zinc-950/40 flex items-center justify-center">
                    <IconLogoGear className="w-10 h-10 text-emerald-400" />
                  </div>
                )}
              </div>

              <div className="text-center mb-4">
                <h3 className="text-base font-semibold mb-1 text-zinc-100">
                  {latestRelease?.appManifest?.label ||
                    latestRelease?.appManifest?.id ||
                    'Unknown App'}
                </h3>
                <div className="text-xs leading-5 text-zinc-500">
                  <div>Version {latestRelease?.appManifest?.version || 'N/A'}</div>
                  <div>{appReleaseServer?.totalDownloads?.toLocaleString() || 0} downloads</div>
                  {appReleaseServer.mainRelease.appManifest.author && (
                    <div>Made By {appReleaseServer.mainRelease.appManifest.author}</div>
                  )}
                </div>
              </div>
            </button>
            <div className="w-full">
              <Button
                title="Download Latest"
                onClick={() => handleDownload(latestRelease)}
                className="action-button action-button-primary w-full gap-2 justify-center"
              >
                <p>Download latest</p>
                <IconDownload />
              </Button>
            </div>
          </div>
        )}
      </div>
      {searchParams.get('download_page') === latestRelease.appManifest.id && (
        <AppReleaseHistoryModal
          onDownload={handleDownload}
          onRemove={handleRemove}
          appReleaseServer={appReleaseServer}
        />
      )}
      {downloadError && (
        <DownloadErrorOverlay
          error={downloadError}
          onAcknowledge={() => setDownloadError(null)}
          title={`Failed to load App: ${latestRelease?.appManifest?.label || 'Unknown App'}`}
        />
      )}
    </>
  )
}
