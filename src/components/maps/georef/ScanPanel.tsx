'use client'

import { useRef, useState, useCallback } from 'react'
import type { ControlPoint } from '@/lib/georef/transform'

type PendingPoint = { mapX: number; mapY: number }

type DisplayInfo = {
  scaleX: number
  scaleY: number
  offsetX: number
  offsetY: number
}

type Props = {
  imageUrl: string
  points: ControlPoint[]
  pendingPoint: PendingPoint | null
  onImageLoad: (w: number, h: number) => void
  onScanClick: (mapX: number, mapY: number) => void
}

const MARKER_SIZE = 20

const ScanPanel = ({ imageUrl, points, pendingPoint, onImageLoad, onScanClick }: Props) => {
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [displayInfo, setDisplayInfo] = useState<DisplayInfo | null>(null)

  const updateDisplayInfo = useCallback(() => {
    const img = imgRef.current
    const container = containerRef.current
    if (!img || !container || img.naturalWidth === 0) return
    const imgRect = img.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    setDisplayInfo({
      scaleX: imgRect.width / img.naturalWidth,
      scaleY: imgRect.height / img.naturalHeight,
      offsetX: imgRect.left - containerRect.left,
      offsetY: imgRect.top - containerRect.top,
    })
  }, [])

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    onImageLoad(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)
    updateDisplayInfo()
  }

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const img = imgRef.current
    if (!img) return
    const rect = img.getBoundingClientRect()
    const mapX = (e.clientX - rect.left) * (img.naturalWidth / rect.width)
    const mapY = (e.clientY - rect.top) * (img.naturalHeight / rect.height)
    onScanClick(mapX, mapY)
  }

  const toDisplay = (mapX: number, mapY: number): { x: number; y: number } | null => {
    if (!displayInfo) return null
    return {
      x: displayInfo.offsetX + mapX * displayInfo.scaleX - MARKER_SIZE / 2,
      y: displayInfo.offsetY + mapY * displayInfo.scaleY - MARKER_SIZE / 2,
    }
  }

  const pendingPos = pendingPoint ? toDisplay(pendingPoint.mapX, pendingPoint.mapY) : null

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-auto bg-muted/30 cursor-crosshair select-none"
      onClick={handleClick}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={imageUrl}
        alt="Map scan"
        className="max-w-none"
        style={{ display: 'block' }}
        onLoad={handleImageLoad}
        draggable={false}
      />

      {points.map((pt, i) => {
        const pos = toDisplay(pt.mapX, pt.mapY)
        if (!pos) return null
        return (
          <div
            key={i}
            className="absolute flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold pointer-events-none"
            style={{ left: pos.x, top: pos.y, width: MARKER_SIZE, height: MARKER_SIZE }}
          >
            {i + 1}
          </div>
        )
      })}

      {pendingPos && (
        <div
          className="absolute flex items-center justify-center rounded-full bg-amber-500 text-white text-xs font-bold pointer-events-none"
          style={{ left: pendingPos.x, top: pendingPos.y, width: MARKER_SIZE, height: MARKER_SIZE }}
        >
          ?
        </div>
      )}
    </div>
  )
}

export default ScanPanel
