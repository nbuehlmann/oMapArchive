import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/server/auth'
import { db } from '@/server/db'
import { maps, mapGeoreferences } from '@/server/db/schema'
import { MapFormatBadge } from '@/components/maps/MapFormatBadge'
import { MapStatusBadge } from '@/components/maps/MapStatusBadge'
import { MapViewer } from '@/components/maps/MapViewer'
import { MapStatusPoller } from '@/components/maps/MapStatusPoller'
import { ShareToggle } from '@/components/maps/ShareToggle'
import { resolveFileUrl } from '@/lib/resolve-file-url'

export const metadata: Metadata = { title: 'Map Detail — oMapArchive' }

type Props = {
  params: Promise<{ id: string }>
}

const MapDetailPage = async ({ params }: Props) => {
  const { id: mapId } = await params
  const session = await auth()
  if (!session?.user?.id) return null

  const row = await db
    .select({ map: maps, georefId: mapGeoreferences.id })
    .from(maps)
    .leftJoin(mapGeoreferences, eq(mapGeoreferences.mapId, maps.id))
    .where(and(eq(maps.id, mapId), eq(maps.userId, session.user.id)))
    .then((r) => r[0] ?? null)

  if (!row) notFound()

  const { map, georefId } = row

  const headersList = await headers()
  const host = headersList.get('host') ?? 'localhost:3000'
  const protocol = host.startsWith('localhost') ? 'http' : 'https'
  const shareUrl = map.isPublic && map.shareToken
    ? `${protocol}://${host}/share/${map.shareToken}`
    : null

  const uploadDate = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(map.uploadedAt))

  const isActive = map.processingStatus === 'pending' || map.processingStatus === 'processing'
  const canGeoreference = map.processingStatus === 'ready' && !georefId

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          href="/maps"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← My Maps
        </Link>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-start gap-3">
          <h1 className="text-2xl font-semibold leading-tight flex-1">{map.title}</h1>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <MapFormatBadge format={map.originalFormat} />
            <MapStatusBadge status={map.processingStatus} />
          </div>
        </div>

        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          {map.scale && (
            <>
              <dt className="sr-only">Scale</dt>
              <dd>1&nbsp;:&nbsp;{map.scale.toLocaleString()}</dd>
            </>
          )}
          {map.equidistance && (
            <>
              <dt className="sr-only">Equidistance</dt>
              <dd>{map.equidistance}&nbsp;m</dd>
            </>
          )}
          {map.yearUpdated && (
            <>
              <dt className="sr-only">Year</dt>
              <dd>{map.yearUpdated}</dd>
            </>
          )}
          {map.cartographer && (
            <>
              <dt className="sr-only">Cartographer</dt>
              <dd>{map.cartographer}</dd>
            </>
          )}
          {map.publisher && (
            <>
              <dt className="sr-only">Publisher</dt>
              <dd>{map.publisher}</dd>
            </>
          )}
          <dt className="sr-only">Uploaded</dt>
          <dd>Uploaded {uploadDate}</dd>
        </dl>
      </div>

      {isActive && (
        <MapStatusPoller
          mapId={map.id}
          initialStatus={map.processingStatus as 'pending' | 'processing'}
        />
      )}

      {map.processedUrl && (
        <MapViewer src={resolveFileUrl(map.processedUrl)} alt={map.title} />
      )}

      {canGeoreference && (
        <Link
          href={`/maps/${map.id}/georeference`}
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
        >
          Georeference this map
        </Link>
      )}

      <div className="rounded-lg border border-border p-4">
        <ShareToggle mapId={map.id} isPublic={map.isPublic} shareUrl={shareUrl} />
      </div>
    </div>
  )
}

export default MapDetailPage
