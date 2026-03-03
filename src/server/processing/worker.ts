import { Worker } from 'bullmq'
import { eq } from 'drizzle-orm'
import { db } from '@/server/db'
import { maps } from '@/server/db/schema'
import { downloadFile, uploadProcessed, uploadTile } from '@/lib/storage/blob-client'
import { getRedisOptions, type MapProcessingJobData } from './queue'
import { processImage } from './image'
import { convertPdfToBuffer } from './pdf'
import { convertOcadToGeoJson } from './ocad'
import { readGeoTiffToBuffer, generateTiles, isLargeImage } from './tiles'

let worker: Worker | null = null

export const startWorker = (): void => {
  if (worker) return

  worker = new Worker<MapProcessingJobData, void, string>(
    'map-processing',
    async (job) => {
      const { mapId, originalFileUrl, originalFormat } = job.data

      await db.update(maps).set({ processingStatus: 'processing' }).where(eq(maps.id, mapId))

      const fileBuffer = await downloadFile(originalFileUrl)

      let processedUrl: string | undefined
      let tileBaseUrl: string | undefined

      if (originalFormat === 'pdf') {
        const png = await convertPdfToBuffer(fileBuffer)
        processedUrl = await uploadProcessed(mapId, 'map.png', png, 'image/png')
      } else if (originalFormat === 'ocad' || originalFormat === 'oom') {
        const geojson = await convertOcadToGeoJson(fileBuffer)
        processedUrl = await uploadProcessed(
          mapId,
          'map.geojson',
          geojson,
          'application/geo+json',
        )
      } else if (originalFormat === 'geotiff') {
        const { png, width, height } = await readGeoTiffToBuffer(fileBuffer)
        processedUrl = await uploadProcessed(mapId, 'map.png', png, 'image/png')
        if (isLargeImage(width, height)) {
          const tiles = await generateTiles(png, width, height)
          await Promise.all(tiles.map((t) => uploadTile(mapId, t.z, t.x, t.y, t.buffer)))
          tileBaseUrl = `tiles/${mapId}`
        }
      } else {
        // jpeg / png
        const optimised = await processImage(fileBuffer)
        processedUrl = await uploadProcessed(mapId, 'map.png', optimised, 'image/png')
      }

      await db
        .update(maps)
        .set({ processingStatus: 'ready', processedUrl, tileBaseUrl: tileBaseUrl ?? null })
        .where(eq(maps.id, mapId))
    },
    { connection: getRedisOptions() },
  )

  worker.on('failed', (job, err) => {
    if (!job) return
    const { mapId } = job.data as MapProcessingJobData
    db.update(maps)
      .set({ processingStatus: 'failed', processingError: err.message })
      .where(eq(maps.id, mapId))
      .catch(() => undefined) // best-effort
  })
}

export const stopWorker = async (): Promise<void> => {
  await worker?.close()
  worker = null
}
