'use client'

import { useState, useTransition } from 'react'
import { deleteMapAction } from '@/server/maps/actions'

type Props = {
  mapId: string
}

export const DeleteMapButton = ({ mapId }: Props) => {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleDelete = () => {
    startTransition(async () => {
      try {
        await deleteMapAction(mapId)
      } catch {
        setError('Failed to delete map. Please try again.')
        setConfirming(false)
      }
    })
  }

  if (error) {
    return <p className="text-xs text-destructive">{error}</p>
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Delete map?</span>
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="text-xs font-medium text-destructive hover:underline disabled:opacity-50"
        >
          {isPending ? 'Deleting…' : 'Confirm'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          disabled={isPending}
          className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-xs text-muted-foreground hover:text-destructive transition-colors"
    >
      Delete
    </button>
  )
}
