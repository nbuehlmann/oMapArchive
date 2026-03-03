import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockConvertFn = vi.fn()
const mockFromBuffer = vi.fn(() => mockConvertFn)
const mockProcessImage = vi.fn()
const mockMkdtemp = vi.fn()
const mockMkdir = vi.fn()
const mockRm = vi.fn()

vi.mock('pdf2pic', () => ({ fromBuffer: mockFromBuffer }))

vi.mock('./image', () => ({ processImage: mockProcessImage }))

vi.mock('fs/promises', () => ({
  default: {
    mkdtemp: mockMkdtemp,
    mkdir: mockMkdir,
    rm: mockRm,
  },
}))

describe('convertPdfToBuffer', () => {
  beforeEach(() => {
    vi.resetModules()
    mockMkdtemp.mockResolvedValue('/tmp/omap-pdf-abc')
    mockMkdir.mockResolvedValue(undefined)
    mockRm.mockResolvedValue(undefined)
    mockProcessImage.mockResolvedValue(Buffer.from('processed-png'))
  })

  it('returns the processed image buffer', async () => {
    mockConvertFn.mockResolvedValue({ buffer: Buffer.from('pdf-page-png') })

    const { convertPdfToBuffer } = await import('./pdf')
    const result = await convertPdfToBuffer(Buffer.from('pdf-data'))

    expect(mockFromBuffer).toHaveBeenCalled()
    expect(mockProcessImage).toHaveBeenCalledWith(Buffer.from('pdf-page-png'))
    expect(result).toEqual(Buffer.from('processed-png'))
    expect(mockRm).toHaveBeenCalledWith('/tmp/omap-pdf-abc', { recursive: true, force: true })
  })

  it('throws when pdf2pic returns no buffer', async () => {
    mockConvertFn.mockResolvedValue({ buffer: null })

    const { convertPdfToBuffer } = await import('./pdf')
    await expect(convertPdfToBuffer(Buffer.from('pdf-data'))).rejects.toThrow(
      'pdf2pic returned no buffer',
    )
    expect(mockRm).toHaveBeenCalledWith('/tmp/omap-pdf-abc', { recursive: true, force: true })
  })
})
