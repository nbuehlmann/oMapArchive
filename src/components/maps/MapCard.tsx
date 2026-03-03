import type { Map } from '@/server/db/schema'
import { MapFormatBadge } from './MapFormatBadge'
import { MapStatusBadge } from './MapStatusBadge'

type MapCardProps = {
  map: Map
}

export const MapCard = ({ map }: MapCardProps) => {
  const uploadDate = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(map.uploadedAt))

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow space-y-3">
      <div>
        <h3 className="font-medium text-card-foreground leading-tight line-clamp-2">{map.title}</h3>
        {map.description && (
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{map.description}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <MapFormatBadge format={map.originalFormat} />
        <MapStatusBadge status={map.processingStatus} />
      </div>

      <p className="text-xs text-muted-foreground">Uploaded {uploadDate}</p>
    </div>
  )
}
