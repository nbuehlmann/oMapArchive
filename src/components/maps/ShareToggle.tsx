'use client'

import { useState, useTransition } from 'react'
import { toggleMapPublicAction } from '@/server/maps/actions'

type ShareToggleProps = {
  mapId: string
  isPublic: boolean
  shareUrl: string | null
}

export const ShareToggle = ({ mapId, isPublic: initialIsPublic, shareUrl: initialShareUrl }: ShareToggleProps) => {
  const [isPublic, setIsPublic] = useState(initialIsPublic)
  const [shareUrl, setShareUrl] = useState<string | null>(initialShareUrl)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleToggle = () => {
    setError(null)
    startTransition(async () => {
      try {
        const result = await toggleMapPublicAction(mapId)
        setIsPublic(result.isPublic)
        setShareUrl(result.shareUrl)
      } catch {
        setError('Failed to update sharing settings. Please try again.')
      }
    })
  }

  const handleCopy = () => {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Public sharing</span>
        <button
          onClick={handleToggle}
          disabled={isPending}
          className="rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isPending ? 'Updating…' : isPublic ? 'Make private' : 'Make public'}
        </button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {isPublic && shareUrl && (
        <div className="flex gap-2">
          <input
            readOnly
            value={shareUrl}
            className="min-w-0 flex-1 rounded-md border border-input bg-muted px-3 py-1.5 text-xs text-muted-foreground"
          />
          <button
            onClick={handleCopy}
            className="rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:opacity-90 transition-opacity"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  )
}
