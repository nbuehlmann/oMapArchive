import os from 'os'
import path from 'path'
import fs from 'fs/promises'
import { fromBuffer } from 'pdf2pic'
import { processImage } from './image'

// NOTE: requires GraphicsMagick or ImageMagick installed on the host
export const convertPdfToBuffer = async (pdfBuffer: Buffer): Promise<Buffer> => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'omap-pdf-'))
  try {
    const savePath = path.join(tmpDir, 'out')
    await fs.mkdir(savePath)
    const result = await fromBuffer(pdfBuffer, {
      density: 150,
      savePath,
      saveFilename: 'page',
      format: 'png',
    })(1, { responseType: 'buffer' })
    if (!result.buffer) throw new Error('pdf2pic returned no buffer')
    return processImage(result.buffer)
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}
