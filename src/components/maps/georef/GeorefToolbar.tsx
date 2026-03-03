'use client'

import Link from 'next/link'
import type { TransformType } from '@/lib/georef/transform'

type Props = {
  mapId: string
  pointCount: number
  transformType: TransformType | null
  saving: boolean
  error: string | null
  onSave: () => void
}

const GeorefToolbar = ({ mapId, pointCount, transformType, saving, error, onSave }: Props) => {
  const canSave = pointCount >= 3 && !saving

  return (
    <div className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background px-4 py-2">
      <Link
        href={`/maps/${mapId}`}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Back
      </Link>

      <span className="text-sm text-muted-foreground">{pointCount} point{pointCount !== 1 ? 's' : ''}</span>

      {transformType && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium uppercase tracking-wide">
          {transformType}
        </span>
      )}

      {error && <span className="text-sm text-destructive">{error}</span>}

      <button
        onClick={onSave}
        disabled={!canSave}
        className="ml-auto rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-sm disabled:opacity-40 hover:opacity-90 transition-opacity"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

export default GeorefToolbar
