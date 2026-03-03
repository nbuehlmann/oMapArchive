import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockToBuffer = vi.fn()
const mockPng = vi.fn()
const mockResize = vi.fn()

vi.mock('sharp', () => {
  const chain = {
    resize: mockResize,
    png: mockPng,
    toBuffer: mockToBuffer,
  }
  mockResize.mockReturnValue(chain)
  mockPng.mockReturnValue(chain)
  return { default: vi.fn(() => chain) }
})

describe('processImage', () => {
  beforeEach(() => {
    vi.resetModules()
    mockToBuffer.mockResolvedValue(Buffer.from('processed'))
  })

  it('calls resize and png and returns the buffer', async () => {
    const { processImage } = await import('./image')
    const input = Buffer.from('raw-image-data')
    const result = await processImage(input)

    expect(mockResize).toHaveBeenCalledWith({
      width: 4000,
      height: 4000,
      fit: 'inside',
      withoutEnlargement: true,
    })
    expect(mockPng).toHaveBeenCalledWith({ compressionLevel: 8 })
    expect(result).toEqual(Buffer.from('processed'))
  })
})
