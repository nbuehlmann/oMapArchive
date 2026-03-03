'use client'

import { useEffect, useRef } from 'react'
import type { ControlPoint, WorldFile } from '@/lib/georef/transform'
import { computeImageCorners } from '@/lib/georef/transform'

type Props = {
  points: ControlPoint[]
  worldFile: WorldFile | null
  imageSize: { w: number; h: number } | null
  imageUrl: string
  awaitingOsmClick: boolean
  onOsmClick: (lng: number, lat: number) => void
}

type MapLibreMap = {
  remove: () => void
  on: (event: string, handler: (e: { lngLat: { lng: number; lat: number } }) => void) => void
  once: (event: string, handler: (e: { lngLat: { lng: number; lat: number } }) => void) => void
  addSource: (id: string, source: unknown) => void
  getSource: (id: string) => { updateImage?: (opts: unknown) => void } | undefined
  addLayer: (layer: unknown) => void
  getLayer: (id: string) => unknown
}

type MapLibreMarker = {
  setLngLat: (coords: [number, number]) => MapLibreMarker
  addTo: (map: MapLibreMap) => MapLibreMarker
  remove: () => void
}

type MapLibreConstructors = {
  Map: new (opts: unknown) => MapLibreMap
  Marker: new () => MapLibreMarker
}

const OsmPanel = ({ points, worldFile, imageSize, imageUrl, awaitingOsmClick, onOsmClick }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef<MapLibreMarker[]>([])
  const libRef = useRef<MapLibreConstructors | null>(null)

  // Initialize map (SSR-safe dynamic import)
  useEffect(() => {
    let cancelled = false
    const init = async () => {
      const ml = await import('maplibre-gl')
      if (cancelled || !containerRef.current) return
      libRef.current = ml as unknown as MapLibreConstructors
      mapRef.current = new ml.Map({
        container: containerRef.current,
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center: [10, 51],
        zoom: 5,
      }) as unknown as MapLibreMap
    }
    void init()
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  // Sync markers
  useEffect(() => {
    const map = mapRef.current
    const lib = libRef.current
    if (!map || !lib) return
    markersRef.current.forEach((m) => m.remove())
    markersRef.current = points.map((pt) =>
      new lib.Marker().setLngLat([pt.lng, pt.lat]).addTo(map),
    )
  }, [points])

  // OSM click handler
  useEffect(() => {
    const map = mapRef.current
    if (!map || !awaitingOsmClick) return
    const handler = (e: { lngLat: { lng: number; lat: number } }) => {
      onOsmClick(e.lngLat.lng, e.lngLat.lat)
    }
    map.once('click', handler)
  }, [awaitingOsmClick, onOsmClick])

  // Map overlay
  useEffect(() => {
    const map = mapRef.current
    if (!map || !worldFile || !imageSize) return

    const { topLeft, topRight, bottomRight, bottomLeft } = computeImageCorners(
      worldFile,
      imageSize.w,
      imageSize.h,
    )
    // MapLibre image source coordinates: [topLeft, topRight, bottomRight, bottomLeft]
    const coordinates = [topLeft, topRight, bottomRight, bottomLeft]

    const existing = map.getSource('georef-overlay')
    if (existing?.updateImage) {
      existing.updateImage({ url: imageUrl, coordinates })
    } else {
      if (!map.getLayer('georef-overlay-layer')) {
        map.addSource('georef-overlay', {
          type: 'image',
          url: imageUrl,
          coordinates,
        })
        map.addLayer({
          id: 'georef-overlay-layer',
          type: 'raster',
          source: 'georef-overlay',
          paint: { 'raster-opacity': 0.7 },
        })
      }
    }
  }, [worldFile, imageSize, imageUrl])

  return (
    <div className="relative flex-1">
      {awaitingOsmClick && (
        <div className="absolute inset-x-0 top-2 z-10 flex justify-center">
          <span className="rounded-full bg-amber-500 px-3 py-1 text-xs font-medium text-white shadow">
            Click the matching location on the map
          </span>
        </div>
      )}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}

export default OsmPanel
