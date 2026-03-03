import { fromArrayBuffer } from 'geotiff'
import sharp from 'sharp'

const TILE_SIZE = 256
const LARGE_IMAGE_THRESHOLD = 4000

export type TileResult = { z: number; x: number; y: number; buffer: Buffer }

export const readGeoTiffToBuffer = async (
  input: Buffer,
): Promise<{ png: Buffer; width: number; height: number }> => {
  const tiff = await fromArrayBuffer(
    input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer,
  )
  const image = await tiff.getImage()
  const width = image.getWidth()
  const height = image.getHeight()
  const rasters = await image.readRasters({ interleave: true })
  const channels = image.getSamplesPerPixel() as 1 | 2 | 3 | 4
  // readRasters with interleave: true returns a single TypedArray; cast via unknown to extract buffer
  const rasterArray = rasters as unknown as Uint8Array
  const png = await sharp(Buffer.from(rasterArray.buffer, rasterArray.byteOffset, rasterArray.byteLength), {
    raw: { width, height, channels },
  })
    .png({ compressionLevel: 8 })
    .toBuffer()
  return { png, width, height }
}

export const generateTiles = async (
  png: Buffer,
  width: number,
  height: number,
): Promise<TileResult[]> => {
  const maxDim = Math.max(width, height)
  const maxZ = Math.ceil(Math.log2(maxDim / TILE_SIZE))
  const tiles: TileResult[] = []

  for (let z = 0; z <= maxZ; z++) {
    const scale = Math.pow(2, z - maxZ)
    const sw = Math.max(1, Math.round(width * scale))
    const sh = Math.max(1, Math.round(height * scale))
    const tilesX = Math.ceil(sw / TILE_SIZE)
    const tilesY = Math.ceil(sh / TILE_SIZE)
    const scaled = await sharp(png).resize(sw, sh, { fit: 'contain' }).png().toBuffer()
    for (let x = 0; x < tilesX; x++) {
      for (let y = 0; y < tilesY; y++) {
        const tileW = Math.min(TILE_SIZE, sw - x * TILE_SIZE)
        const tileH = Math.min(TILE_SIZE, sh - y * TILE_SIZE)
        const tileBuffer = await sharp(scaled)
          .extract({ left: x * TILE_SIZE, top: y * TILE_SIZE, width: tileW, height: tileH })
          .resize(TILE_SIZE, TILE_SIZE, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .png()
          .toBuffer()
        tiles.push({ z, x, y, buffer: tileBuffer })
      }
    }
  }
  return tiles
}

export const isLargeImage = (width: number, height: number): boolean =>
  Math.max(width, height) >= LARGE_IMAGE_THRESHOLD
