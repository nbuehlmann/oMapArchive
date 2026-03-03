'use client'

import type { ControlPoint } from '@/lib/georef/transform'

type Props = {
  points: ControlPoint[]
  onRemove: (index: number) => void
}

const ControlPointList = ({ points, onRemove }: Props) => {
  if (points.length === 0) {
    return (
      <div className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
        Click on the map image to place a control point, then click the matching location on the OSM map.
      </div>
    )
  }

  return (
    <div className="border-t border-border overflow-y-auto" style={{ maxHeight: '160px' }}>
      <table className="w-full text-xs">
        <thead className="bg-muted/50 sticky top-0">
          <tr>
            <th className="px-3 py-1.5 text-left font-medium">#</th>
            <th className="px-3 py-1.5 text-left font-medium">Scan (px)</th>
            <th className="px-3 py-1.5 text-left font-medium">Geo (lng, lat)</th>
            <th className="px-3 py-1.5" />
          </tr>
        </thead>
        <tbody>
          {points.map((pt, i) => (
            <tr key={i} className="border-t border-border/50">
              <td className="px-3 py-1 font-medium">{i + 1}</td>
              <td className="px-3 py-1 font-mono">
                {Math.round(pt.mapX)}, {Math.round(pt.mapY)}
              </td>
              <td className="px-3 py-1 font-mono">
                {pt.lng.toFixed(6)}, {pt.lat.toFixed(6)}
              </td>
              <td className="px-3 py-1">
                <button
                  onClick={() => onRemove(i)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label={`Remove point ${i + 1}`}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default ControlPointList
