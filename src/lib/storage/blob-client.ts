import fs from 'fs/promises'
import path from 'path'
import { env } from '@/env'

/**
 * Downloads a file from wherever it was originally stored.
 *
 * Local `local:` URI → read from `.local-storage/` filesystem.
 * Azure URL → download via BlobServiceClient.
 */
export const downloadFile = async (fileUrl: string): Promise<Buffer> => {
  if (fileUrl.startsWith('local:')) {
    const relativePath = fileUrl.slice('local:'.length)
    const fullPath = path.join(process.cwd(), '.local-storage', relativePath)
    return fs.readFile(fullPath)
  }

  const { BlobServiceClient } = await import('@azure/storage-blob')
  const blobServiceClient = new BlobServiceClient(
    `https://${env.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net?${env.AZURE_STORAGE_SAS_TOKEN}`,
  )
  const url = new URL(fileUrl)
  const parts = url.pathname.split('/').filter(Boolean)
  const containerName = parts[0] ?? 'originals'
  const blobName = parts.slice(1).join('/')
  const containerClient = blobServiceClient.getContainerClient(containerName)
  const blobClient = containerClient.getBlobClient(blobName)
  const response = await blobClient.download()
  const chunks: Buffer[] = []
  for await (const chunk of response.readableStreamBody as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

/**
 * Uploads a processed map file (e.g. optimised PNG, GeoJSON) to the processed store.
 *
 * Returns the URL to persist in the DB.
 */
export const uploadProcessed = async (
  mapId: string,
  fileName: string,
  data: Buffer,
  contentType: string,
): Promise<string> => {
  if (env.AZURE_STORAGE_ACCOUNT_NAME && env.AZURE_STORAGE_SAS_TOKEN) {
    const { BlobServiceClient } = await import('@azure/storage-blob')
    const blobServiceClient = new BlobServiceClient(
      `https://${env.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net?${env.AZURE_STORAGE_SAS_TOKEN}`,
    )
    const containerClient = blobServiceClient.getContainerClient('processed')
    const blobName = `${mapId}/${fileName}`
    const blockBlobClient = containerClient.getBlockBlobClient(blobName)
    await blockBlobClient.uploadData(data, { blobHTTPHeaders: { blobContentType: contentType } })
    return blockBlobClient.url
  }

  const dir = path.join(process.cwd(), '.local-storage', 'processed', mapId)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, fileName), data)
  return `local:processed/${mapId}/${fileName}`
}

/**
 * Uploads a map tile to the tiles store.
 *
 * Returns the URL (Azure blob URL or local: URI).
 */
export const uploadTile = async (
  mapId: string,
  z: number,
  x: number,
  y: number,
  data: Buffer,
): Promise<string> => {
  if (env.AZURE_STORAGE_ACCOUNT_NAME && env.AZURE_STORAGE_SAS_TOKEN) {
    const { BlobServiceClient } = await import('@azure/storage-blob')
    const blobServiceClient = new BlobServiceClient(
      `https://${env.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net?${env.AZURE_STORAGE_SAS_TOKEN}`,
    )
    const containerClient = blobServiceClient.getContainerClient('tiles')
    const blobName = `${mapId}/${z}/${x}/${y}.png`
    const blockBlobClient = containerClient.getBlockBlobClient(blobName)
    await blockBlobClient.uploadData(data, { blobHTTPHeaders: { blobContentType: 'image/png' } })
    return blockBlobClient.url
  }

  const dir = path.join(process.cwd(), '.local-storage', 'tiles', mapId, String(z), String(x))
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, `${y}.png`), data)
  return `local:tiles/${mapId}/${z}/${x}/${y}.png`
}

/**
 * Uploads a map file to the originals store.
 *
 * Production: Azure Blob Storage (requires AZURE_STORAGE_ACCOUNT_NAME + AZURE_STORAGE_SAS_TOKEN).
 * Development fallback: local filesystem at .local-storage/originals/<userId>/<mapId>/<filename>.
 *
 * Returns the URL (Azure blob URL or local: URI) to persist in the DB.
 */
export const uploadOriginal = async (
  userId: string,
  mapId: string,
  filename: string,
  data: Buffer,
): Promise<string> => {
  if (env.AZURE_STORAGE_ACCOUNT_NAME && env.AZURE_STORAGE_SAS_TOKEN) {
    const { BlobServiceClient } = await import('@azure/storage-blob')
    const blobServiceClient = new BlobServiceClient(
      `https://${env.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net?${env.AZURE_STORAGE_SAS_TOKEN}`,
    )
    const containerClient = blobServiceClient.getContainerClient('originals')
    const blobName = `${userId}/${mapId}/${filename}`
    const blockBlobClient = containerClient.getBlockBlobClient(blobName)
    await blockBlobClient.uploadData(data)
    return blockBlobClient.url
  }

  // Local filesystem fallback for development
  const dir = path.join(process.cwd(), '.local-storage', 'originals', userId, mapId)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, filename), data)
  return `local:originals/${userId}/${mapId}/${filename}`
}

/**
 * Deletes a map file from the originals store.
 * Errors are swallowed — a missing file should not block DB record deletion.
 */
export const deleteOriginal = async (fileUrl: string): Promise<void> => {
  if (fileUrl.startsWith('local:')) {
    const relativePath = fileUrl.slice('local:'.length)
    const fullPath = path.join(process.cwd(), '.local-storage', relativePath)
    await fs.unlink(fullPath).catch(() => undefined)
    return
  }

  if (env.AZURE_STORAGE_ACCOUNT_NAME && env.AZURE_STORAGE_SAS_TOKEN) {
    const { BlobServiceClient } = await import('@azure/storage-blob')
    const blobServiceClient = new BlobServiceClient(
      `https://${env.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net?${env.AZURE_STORAGE_SAS_TOKEN}`,
    )
    const containerClient = blobServiceClient.getContainerClient('originals')
    const blobName = new URL(fileUrl).pathname.split('/originals/')[1]
    if (blobName) {
      await containerClient.deleteBlob(blobName).catch(() => undefined)
    }
  }
}
