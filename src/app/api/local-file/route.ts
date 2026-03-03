/**
 * Dev-only API route that serves files stored under .local-storage/.
 * In production, processed files are served directly from Azure Blob Storage
 * and this route is never called (processedUrl will be an HTTPS blob URL).
 */
import fs from 'fs/promises'
import path from 'path'
import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/server/auth'

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  json: 'application/json',
  geojson: 'application/geo+json',
}

export const GET = async (req: NextRequest): Promise<NextResponse> => {
  const session = await auth()
  if (!session?.user?.id) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const filePath = req.nextUrl.searchParams.get('path')
  if (!filePath) {
    return new NextResponse('Missing path', { status: 400 })
  }

  // Prevent directory traversal — reject any path component that starts with '..'
  const parts = filePath.split('/')
  if (parts.some((p) => p === '..' || p === '')) {
    return new NextResponse('Invalid path', { status: 400 })
  }

  const fullPath = path.join(process.cwd(), '.local-storage', ...parts)

  let data: Buffer
  try {
    data = await fs.readFile(fullPath)
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }

  const ext = parts[parts.length - 1]?.split('.').pop()?.toLowerCase() ?? ''
  const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream'

  return new NextResponse(new Uint8Array(data), {
    headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=3600' },
  })
}
