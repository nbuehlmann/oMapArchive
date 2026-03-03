import sharp from 'sharp'

export const processImage = async (input: Buffer): Promise<Buffer> =>
  sharp(input)
    .resize({ width: 4000, height: 4000, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 8 })
    .toBuffer()
