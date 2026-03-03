'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { auth } from '@/server/auth'
import { db } from '@/server/db'
import { maps, originalFormatEnum } from '@/server/db/schema'
import { deleteOriginal, uploadOriginal } from '@/lib/storage/blob-client'
import { mapProcessingQueue } from '@/server/processing/queue'

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
    .number({ invalid_type_error: 'Scale must be a number' })
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
    const first = parsed.error.errors[0]
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
