'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getMapStatusAction } from '@/server/maps/actions'

type ActiveStatus = 'pending' | 'processing'

type MapStatusPollerProps = {
  mapId: string
  initialStatus: ActiveStatus
}

export const MapStatusPoller = ({ mapId, initialStatus }: MapStatusPollerProps) => {
  const router = useRouter()
  const [status, setStatus] = useState<string>(initialStatus)

  useEffect(() => {
    const interval = setInterval(async () => {
      const next = await getMapStatusAction(mapId)
      if (!next) return
      setStatus(next)
      if (next === 'ready' || next === 'failed') {
        clearInterval(interval)
        router.refresh()
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [mapId, router])

  if (status === 'failed') {
    return (
      <p className="text-sm text-destructive">
        Processing failed. Please try deleting and re-uploading the map.
      </p>
    )
  }

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {status === 'pending' ? 'Queued for processing…' : 'Processing your map…'}
    </div>
  )
}
