import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- sharp mock ---
const mockSharpToBuffer = vi.fn()
const mockSharpPng = vi.fn()
const mockSharpResize = vi.fn()
const mockSharpExtract = vi.fn()
const mockSharpRaw = vi.fn()

const sharpChain = {
  resize: mockSharpResize,
  png: mockSharpPng,
  toBuffer: mockSharpToBuffer,
  extract: mockSharpExtract,
  raw: mockSharpRaw,
}
mockSharpResize.mockReturnValue(sharpChain)
mockSharpPng.mockReturnValue(sharpChain)
mockSharpExtract.mockReturnValue(sharpChain)
mockSharpRaw.mockReturnValue(sharpChain)

vi.mock('sharp', () => ({ default: vi.fn(() => sharpChain) }))

// --- geotiff mock ---
const mockGetWidth = vi.fn(() => 512)
const mockGetHeight = vi.fn(() => 512)
const mockGetSamplesPerPixel = vi.fn(() => 3)
const mockReadRasters = vi.fn()
const mockGetImage = vi.fn()
const mockFromArrayBuffer = vi.fn()

vi.mock('geotiff', () => ({ fromArrayBuffer: mockFromArrayBuffer }))

describe('isLargeImage', () => {
  it('returns true when max dimension >= 4000', async () => {
    const { isLargeImage } = await import('./tiles')
    expect(isLargeImage(4000, 100)).toBe(true)
    expect(isLargeImage(100, 5000)).toBe(true)
    expect(isLargeImage(3999, 3999)).toBe(false)
  })
})

describe('readGeoTiffToBuffer', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetWidth.mockReturnValue(512)
    mockGetHeight.mockReturnValue(512)
    mockGetSamplesPerPixel.mockReturnValue(3)
    mockReadRasters.mockResolvedValue(new Uint8Array(512 * 512 * 3))
    mockGetImage.mockResolvedValue({
      getWidth: mockGetWidth,
      getHeight: mockGetHeight,
      getSamplesPerPixel: mockGetSamplesPerPixel,
      readRasters: mockReadRasters,
    })
    mockFromArrayBuffer.mockResolvedValue({ getImage: mockGetImage })
    mockSharpToBuffer.mockResolvedValue(Buffer.from('png-data'))
  })

  it('returns png buffer, width, and height', async () => {
    const { readGeoTiffToBuffer } = await import('./tiles')
    const result = await readGeoTiffToBuffer(Buffer.from('tiff-data'))

    expect(result.width).toBe(512)
    expect(result.height).toBe(512)
    expect(result.png).toEqual(Buffer.from('png-data'))
  })
})

describe('generateTiles', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSharpToBuffer.mockResolvedValue(Buffer.from('tile'))
  })

  it('generates the correct number of tiles for a 512x512 image', async () => {
    const { generateTiles } = await import('./tiles')
    // 512x512: maxZ = ceil(log2(512/256)) = ceil(1) = 1
    // z=0: scale=0.5 → sw=sh=256, 1x1 tile = 1 tile
    // z=1: scale=1   → sw=sh=512, 2x2 tiles = 4 tiles
    // total = 5
    const tiles = await generateTiles(Buffer.from('png'), 512, 512)
    expect(tiles.length).toBe(5)
    expect(tiles[0]).toMatchObject({ z: 0, x: 0, y: 0 })
  })
})
