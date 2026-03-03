import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { auth } from '@/server/auth'
import { db } from '@/server/db'
import { maps, mapGeoreferences } from '@/server/db/schema'
import { resolveFileUrl } from '@/lib/resolve-file-url'
import { GeoreferenceEditor } from '@/components/maps/GeoreferenceEditor'
import type { ControlPoint } from '@/lib/georef/transform'

export const metadata: Metadata = { title: 'Georeference Map — oMapArchive' }

type Props = {
  params: Promise<{ id: string }>
}

const GeoreferencePage = async ({ params }: Props) => {
  const { id: mapId } = await params
  const session = await auth()
  if (!session?.user?.id) return null

  const row = await db
    .select({ map: maps, georef: mapGeoreferences })
    .from(maps)
    .leftJoin(mapGeoreferences, eq(mapGeoreferences.mapId, maps.id))
    .where(and(eq(maps.id, mapId), eq(maps.userId, session.user.id)))
    .then((r) => r[0] ?? null)

  if (!row) notFound()

  const { map, georef } = row

  if (map.processingStatus !== 'ready') {
    redirect(`/maps/${mapId}`)
  }

  if (!map.processedUrl) notFound()

  const imageUrl = resolveFileUrl(map.processedUrl)
  const initialControlPoints = (georef?.controlPoints ?? []) as ControlPoint[]

  return (
    <GeoreferenceEditor
      mapId={mapId}
      imageUrl={imageUrl}
      initialControlPoints={initialControlPoints}
    />
  )
}

export default GeoreferencePage
