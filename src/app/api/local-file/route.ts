/**
 * Dev-only API route that serves files stored under .local-storage/.
 * In production, processed files are served directly from Azure Blob Storage
 * and this route is never called (processedUrl will be an HTTPS blob URL).
 */
import fs from 'fs/promises'
import path from 'path'
import { type NextRequest, NextResponse } from 'next/server'
import { auth } from '@/server/auth'

const LOCAL_STORAGE_ROOT = path.resolve(process.cwd(), '.local-storage')

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

  // Resolve to an absolute path and confirm it stays within LOCAL_STORAGE_ROOT.
  // This is the canonical defence against path-traversal: no matter what the
  // input contains (e.g. "../", "%2e%2e/", null bytes), the check below catches it.
  const resolved = path.resolve(LOCAL_STORAGE_ROOT, filePath)
  if (!resolved.startsWith(LOCAL_STORAGE_ROOT + path.sep)) {
    return new NextResponse('Invalid path', { status: 400 })
  }

  let data: Buffer
  try {
    data = await fs.readFile(resolved)
  } catch {
    return new NextResponse('Not found', { status: 404 })
  }

  const ext = resolved.split('.').pop()?.toLowerCase() ?? ''
  const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream'

  return new NextResponse(new Uint8Array(data), {
    headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=3600' },
  })
}
