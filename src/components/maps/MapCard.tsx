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
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {map.scale && <span>1 : {map.scale.toLocaleString()}</span>}
          {map.equidistance && <span>{map.equidistance} m</span>}
          {map.yearUpdated && <span>{map.yearUpdated}</span>}
          {map.cartographer && <span>{map.cartographer}</span>}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <MapFormatBadge format={map.originalFormat} />
        <MapStatusBadge status={map.processingStatus} />
      </div>

      <p className="text-xs text-muted-foreground">Uploaded {uploadDate}</p>
    </div>
  )
}
