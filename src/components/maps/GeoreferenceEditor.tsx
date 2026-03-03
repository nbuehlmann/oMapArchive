'use client'

import { useState, useTransition } from 'react'
import { computeWorldFile, type ControlPoint } from '@/lib/georef/transform'
import { saveGeoreferenceAction } from '@/server/maps/actions'
import GeorefToolbar from './georef/GeorefToolbar'
import ScanPanel from './georef/ScanPanel'
import OsmPanel from './georef/OsmPanel'
import ControlPointList from './georef/ControlPointList'

type Props = {
  mapId: string
  imageUrl: string
  initialControlPoints: ControlPoint[]
}

const GeoreferenceEditor = ({ mapId, imageUrl, initialControlPoints }: Props) => {
  const [points, setPoints] = useState<ControlPoint[]>(initialControlPoints)
  const [pending, setPending] = useState<{ mapX: number; mapY: number } | null>(null)
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, startSave] = useTransition()

  const worldFileResult = points.length >= 3 ? computeWorldFile(points) : null

  const handleScanClick = (mapX: number, mapY: number) => {
    setPending({ mapX, mapY })
  }

  const handleOsmClick = (lng: number, lat: number) => {
    if (!pending) return
    setPoints((prev) => [...prev, { ...pending, lng, lat }])
    setPending(null)
  }

  const handleRemove = (index: number) => {
    setPoints((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSave = () => {
    setError(null)
    startSave(async () => {
      const result = await saveGeoreferenceAction(mapId, points)
      if ('error' in result) setError(result.error)
    })
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <GeorefToolbar
        mapId={mapId}
        pointCount={points.length}
        transformType={worldFileResult?.transformType ?? null}
        saving={saving}
        error={error}
        onSave={handleSave}
      />

      <div className="flex flex-1 overflow-hidden">
        <ScanPanel
          imageUrl={imageUrl}
          points={points}
          pendingPoint={pending}
          onImageLoad={(w, h) => setImageSize({ w, h })}
          onScanClick={handleScanClick}
        />
        <OsmPanel
          points={points}
          worldFile={worldFileResult?.worldFile ?? null}
          imageSize={imageSize}
          imageUrl={imageUrl}
          awaitingOsmClick={pending !== null}
          onOsmClick={handleOsmClick}
        />
      </div>

      <ControlPointList points={points} onRemove={handleRemove} />
    </div>
  )
}

export { GeoreferenceEditor }
export default GeoreferenceEditor
