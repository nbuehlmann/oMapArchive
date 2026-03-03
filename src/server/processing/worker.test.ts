import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- bullmq mock ---
let capturedProcessor: ((job: unknown) => Promise<void>) | null = null
let capturedFailedHandler: ((job: unknown, err: Error) => void) | null = null

const mockWorkerOn = vi.fn((event: string, handler: (job: unknown, err: Error) => void) => {
  if (event === 'failed') capturedFailedHandler = handler
})

class MockWorkerClass {
  constructor(_queue: string, processor: (job: unknown) => Promise<void>) {
    capturedProcessor = processor
  }
  on = mockWorkerOn
  close = vi.fn()
}
const MockWorker = vi.fn(function MockWorker(
  this: MockWorkerClass,
  queue: string,
  processor: (job: unknown) => Promise<void>,
) {
  capturedProcessor = processor
  this.on = mockWorkerOn
  this.close = vi.fn()
} as unknown as typeof MockWorkerClass)

vi.mock('bullmq', () => ({
  Worker: MockWorker,
  Queue: vi.fn(function MockQueue(this: object) {
    return { add: vi.fn() }
  }),
}))

// --- queue mock (avoids Queue instantiation at module load) ---
vi.mock('./queue', () => ({
  getRedisOptions: vi.fn(() => ({ host: 'localhost', port: 6379, maxRetriesPerRequest: null })),
  mapProcessingQueue: { add: vi.fn() },
}))

// --- env mock ---
vi.mock('@/env', () => ({ env: { REDIS_URL: 'redis://localhost:6379' } }))

// --- db mock ---
const mockDbWhere = vi.fn()
const mockDbSet = vi.fn()
const mockDbUpdate = vi.fn()
mockDbSet.mockReturnValue({ where: mockDbWhere })
mockDbWhere.mockResolvedValue(undefined)
mockDbUpdate.mockReturnValue({ set: mockDbSet })
vi.mock('@/server/db', () => ({ db: { update: mockDbUpdate } }))

// --- schema mock ---
vi.mock('@/server/db/schema', () => ({ maps: {} }))

// --- blob-client mock ---
const mockDownloadFile = vi.fn()
const mockUploadProcessed = vi.fn()
const mockUploadTile = vi.fn()
vi.mock('@/lib/storage/blob-client', () => ({
  downloadFile: mockDownloadFile,
  uploadProcessed: mockUploadProcessed,
  uploadTile: mockUploadTile,
}))

// --- processing handler mocks ---
const mockProcessImage = vi.fn()
vi.mock('./image', () => ({ processImage: mockProcessImage }))

const mockConvertPdfToBuffer = vi.fn()
vi.mock('./pdf', () => ({ convertPdfToBuffer: mockConvertPdfToBuffer }))

const mockConvertOcadToGeoJson = vi.fn()
vi.mock('./ocad', () => ({ convertOcadToGeoJson: mockConvertOcadToGeoJson }))

const mockReadGeoTiffToBuffer = vi.fn()
const mockGenerateTiles = vi.fn()
const mockIsLargeImage = vi.fn()
vi.mock('./tiles', () => ({
  readGeoTiffToBuffer: mockReadGeoTiffToBuffer,
  generateTiles: mockGenerateTiles,
  isLargeImage: mockIsLargeImage,
}))

describe('startWorker', () => {
  beforeEach(() => {
    vi.resetModules()
    capturedProcessor = null
    capturedFailedHandler = null
    mockDbSet.mockReturnValue({ where: mockDbWhere })
    mockDbWhere.mockResolvedValue(undefined)
    mockDbUpdate.mockReturnValue({ set: mockDbSet })
    mockDownloadFile.mockResolvedValue(Buffer.from('file-data'))
    mockUploadProcessed.mockResolvedValue('local:processed/map-id/map.png')
  })

  it('transitions status to ready for jpeg format', async () => {
    mockProcessImage.mockResolvedValue(Buffer.from('optimised'))

    const { startWorker } = await import('./worker')
    startWorker()

    expect(capturedProcessor).not.toBeNull()

    const fakeJob = {
      data: {
        mapId: 'test-map-id',
        originalFileUrl: 'local:originals/user/test-map-id/map.jpg',
        originalFormat: 'jpeg',
      },
    }
    await capturedProcessor!(fakeJob)

    // First update: processing
    expect(mockDbSet).toHaveBeenCalledWith({ processingStatus: 'processing' })

    // Second update: ready
    expect(mockDbSet).toHaveBeenCalledWith(
      expect.objectContaining({
        processingStatus: 'ready',
        processedUrl: 'local:processed/map-id/map.png',
      }),
    )
  })

  it('failed event handler updates DB with error message', async () => {
    const { startWorker } = await import('./worker')
    startWorker()

    expect(capturedFailedHandler).not.toBeNull()

    const fakeJob = { data: { mapId: 'failed-map-id' } }
    const fakeError = new Error('processing exploded')
    capturedFailedHandler!(fakeJob, fakeError)

    expect(mockDbSet).toHaveBeenCalledWith({
      processingStatus: 'failed',
      processingError: 'processing exploded',
    })
  })
})
