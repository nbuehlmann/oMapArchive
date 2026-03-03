import fs from 'fs/promises'
import path from 'path'
import { env } from '@/env'

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
