import { readOcad, ocadToGeoJson } from 'ocad2geojson'

export const convertOcadToGeoJson = async (buffer: Buffer): Promise<Buffer> => {
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer
  const ocadFile = await readOcad(arrayBuffer)
  const geojson = ocadToGeoJson(ocadFile)
  return Buffer.from(JSON.stringify(geojson), 'utf-8')
}
