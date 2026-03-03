import { cn } from '@/lib/utils'

type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed'

const statusStyles: Record<ProcessingStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  processing: 'bg-blue-100 text-blue-800',
  ready: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
}

const statusLabels: Record<ProcessingStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
}

type MapStatusBadgeProps = {
  status: ProcessingStatus
}

export const MapStatusBadge = ({ status }: MapStatusBadgeProps) => {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        statusStyles[status],
      )}
    >
      {statusLabels[status]}
    </span>
  )
}
