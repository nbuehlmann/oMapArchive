import type { FeatureCollection } from 'geojson'

declare module 'ocad2geojson' {
  export function readOcad(buffer: ArrayBuffer): Promise<unknown>
  export function ocadToGeoJson(ocadFile: unknown): FeatureCollection
}
