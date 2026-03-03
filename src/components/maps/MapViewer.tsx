'use client'

type MapViewerProps = {
  src: string
  alt: string
}

export const MapViewer = ({ src, alt }: MapViewerProps) => {
  return (
    <div className="overflow-auto rounded-lg border border-border bg-muted/30 max-h-[70vh]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="w-full h-full object-contain"
        style={{ display: 'block', minHeight: '300px' }}
      />
    </div>
  )
}
