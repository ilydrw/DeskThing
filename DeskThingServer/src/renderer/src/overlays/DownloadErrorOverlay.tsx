import Button from '@renderer/components/Button'

interface DownloadErrorOverlayProps {
  error: string
  onAcknowledge: () => void
  title?: string
  inset?: boolean
}

export const DownloadErrorOverlay = ({
  error,
  onAcknowledge,
  title,
  inset = false
}: DownloadErrorOverlayProps): JSX.Element => {
  return (
    <div
      className={`${inset ? '' : 'fixed'} w-full h-full top-0 left-0 flex items-center justify-center z-50 bg-black/60 backdrop-blur-sm`}
    >
      <div className="max-w-xl bg-zinc-900 border border-red-500/50 text-white p-5 rounded-xl shadow-2xl">
        <h1 className="text-lg font-semibold mb-2 text-red-400">
          {title || 'There was an error:'}
        </h1>
        <code className="bg-zinc-950 p-3 text-red-300 rounded-lg border border-zinc-800 font-mono block mb-4">
          {error.split('\n').map((line, idx) => (
            <div key={idx}>{line}</div>
          ))}
        </code>
        <Button
          onClick={onAcknowledge}
          className="action-button mt-2 !border-red-500/50 !text-red-200 hover:!bg-red-500/10 px-4 py-2"
        >
          Close
        </Button>
      </div>
    </div>
  )
}
