import { cn } from '@/lib/utils'

type OriginalFormat = 'jpeg' | 'png' | 'pdf' | 'geotiff' | 'ocad' | 'oom'

const formatLabels: Record<OriginalFormat, string> = {
  jpeg: 'JPEG',
  png: 'PNG',
  pdf: 'PDF',
  geotiff: 'GeoTIFF',
  ocad: 'OCAD',
  oom: 'OOM',
}

type MapFormatBadgeProps = {
  format: OriginalFormat
}

export const MapFormatBadge = ({ format }: MapFormatBadgeProps) => {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        'bg-muted text-muted-foreground',
      )}
    >
      {formatLabels[format]}
    </span>
  )
}
