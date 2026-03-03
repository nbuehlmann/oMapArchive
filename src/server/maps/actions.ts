'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { auth } from '@/server/auth'
import { db } from '@/server/db'
import { maps, originalFormatEnum } from '@/server/db/schema'
import { deleteOriginal, uploadOriginal } from '@/lib/storage/blob-client'
import { mapProcessingQueue } from '@/server/processing/queue'
import { computeWorldFile, type ControlPoint } from '@/lib/georef/transform'

type OriginalFormat = (typeof originalFormatEnum.enumValues)[number]

const EXT_TO_FORMAT: Record<string, OriginalFormat> = {
  jpg: 'jpeg',
  jpeg: 'jpeg',
  png: 'png',
  pdf: 'pdf',
  tif: 'geotiff',
  tiff: 'geotiff',
  ocd: 'ocad',
  omap: 'oom',
}

const uploadSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  scale: z.coerce
    .number({ error: 'Scale must be a number' })
    .int('Scale must be a whole number')
    .positive('Scale must be positive'),
  equidistance: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce
      .number()
      .min(1, 'Equidistance must be at least 1 m')
      .max(1000, 'Equidistance must be at most 1000 m')
      .multipleOf(0.5, 'Equidistance must be a multiple of 0.5')
      .optional(),
  ),
  yearUpdated: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce
      .number()
      .int()
      .min(1900, 'Year must be 1900 or later')
      .max(new Date().getFullYear(), 'Year cannot be in the future')
      .optional(),
  ),
  cartographer: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().max(200).optional(),
  ),
  publisher: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().max(200).optional(),
  ),
})

export const uploadMapAction = async (
  _prev: string | null,
  formData: FormData,
): Promise<string | null> => {
  const session = await auth()
  if (!session?.user?.id) return 'Not authenticated'

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return 'Please select a file'

  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const format = EXT_TO_FORMAT[ext]
  if (!format) return 'Unsupported file format. Accepted: JPG, PNG, PDF, GeoTIFF, OCD, OMAP'

  const parsed = uploadSchema.safeParse({
    title: formData.get('title'),
    scale: formData.get('scale'),
    equidistance: formData.get('equidistance'),
    yearUpdated: formData.get('yearUpdated'),
    cartographer: formData.get('cartographer'),
    publisher: formData.get('publisher'),
  })

  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return first?.message ?? 'Invalid input'
  }

  const mapId = crypto.randomUUID()
  const data = Buffer.from(await file.arrayBuffer())

  let originalFileUrl: string
  try {
    originalFileUrl = await uploadOriginal(session.user.id, mapId, file.name, data)
  } catch {
    return 'File upload failed. Please try again.'
  }

  await db.insert(maps).values({
    id: mapId,
    userId: session.user.id,
    title: parsed.data.title,
    originalFormat: format,
    originalFileUrl,
    processingStatus: 'pending',
    scale: parsed.data.scale,
    equidistance: parsed.data.equidistance ?? null,
    yearUpdated: parsed.data.yearUpdated ?? null,
    cartographer: parsed.data.cartographer ?? null,
    publisher: parsed.data.publisher ?? null,
  })

  await mapProcessingQueue.add('process-map', {
    mapId,
    originalFileUrl,
    originalFormat: format,
  })

  redirect('/maps')
}

export const deleteMapAction = async (mapId: string): Promise<void> => {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Not authenticated')

  const map = await db
    .select()
    .from(maps)
    .where(eq(maps.id, mapId))
    .then((r) => r[0] ?? null)

  if (!map) throw new Error('Map not found')
  if (map.userId !== session.user.id) throw new Error('Forbidden')

  // Best-effort file deletion — don't let a missing file block the DB delete
  await deleteOriginal(map.originalFileUrl)

  await db.delete(maps).where(eq(maps.id, mapId))

  revalidatePath('/maps')
}

export const getMapStatusAction = async (
  mapId: string,
): Promise<'pending' | 'processing' | 'ready' | 'failed' | null> => {
  const session = await auth()
  if (!session?.user?.id) return null

  const row = await db
    .select({ processingStatus: maps.processingStatus })
    .from(maps)
    .where(and(eq(maps.id, mapId), eq(maps.userId, session.user.id)))
    .then((r) => r[0] ?? null)

  return row?.processingStatus ?? null
}

export const saveGeoreferenceAction = async (
  mapId: string,
  controlPoints: ControlPoint[],
): Promise<{ ok: true } | { error: string }> => {
  const session = await auth()
  if (!session?.user?.id) return { error: 'Not authenticated' }

  if (controlPoints.length < 3) return { error: 'At least 3 control points required' }

  // Verify ownership
  const map = await db
    .select({ id: maps.id })
    .from(maps)
    .where(and(eq(maps.id, mapId), eq(maps.userId, session.user.id)))
    .then((r) => r[0] ?? null)

  if (!map) return { error: 'Map not found' }

  // Server-side recompute — never trust client-supplied transform
  const { worldFile, transformType } = computeWorldFile(controlPoints)

  const pts = controlPoints
  const pointGeoms = pts.map((p) => sql`ST_MakePoint(${p.lng}, ${p.lat})`)
  const collectExpr = sql`ST_Collect(ARRAY[${sql.join(pointGeoms, sql`, `)}])`

  await db.execute(sql`
    INSERT INTO map_georeferences (
      id, map_id, control_points, transform_type, world_file,
      bounding_poly, center_point, georeferenced_at
    ) VALUES (
      gen_random_uuid(),
      ${mapId},
      ${JSON.stringify(pts)}::jsonb,
      ${transformType}::"transform_type",
      ${JSON.stringify(worldFile)}::jsonb,
      ST_ConvexHull(${collectExpr}),
      ST_Centroid(${collectExpr}),
      NOW()
    )
    ON CONFLICT (map_id) DO UPDATE SET
      control_points    = EXCLUDED.control_points,
      transform_type    = EXCLUDED.transform_type,
      world_file        = EXCLUDED.world_file,
      bounding_poly     = EXCLUDED.bounding_poly,
      center_point      = EXCLUDED.center_point,
      georeferenced_at  = NOW()
  `)

  revalidatePath(`/maps/${mapId}`)
  return { ok: true }
}

export const toggleMapPublicAction = async (
  mapId: string,
): Promise<{ isPublic: boolean; shareUrl: string | null }> => {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Not authenticated')

  const map = await db
    .select({ isPublic: maps.isPublic, shareToken: maps.shareToken })
    .from(maps)
    .where(and(eq(maps.id, mapId), eq(maps.userId, session.user.id)))
    .then((r) => r[0] ?? null)

  if (!map) throw new Error('Map not found')

  const headersList = await headers()
  const host = headersList.get('host') ?? 'localhost:3000'
  const protocol = host.startsWith('localhost') ? 'http' : 'https'

  if (map.isPublic) {
    await db
      .update(maps)
      .set({ isPublic: false, shareToken: null })
      .where(eq(maps.id, mapId))
    revalidatePath('/maps')
    return { isPublic: false, shareUrl: null }
  } else {
    const shareToken = crypto.randomUUID()
    await db
      .update(maps)
      .set({ isPublic: true, shareToken })
      .where(eq(maps.id, mapId))
    revalidatePath('/maps')
    return { isPublic: true, shareUrl: `${protocol}://${host}/share/${shareToken}` }
  }
}
