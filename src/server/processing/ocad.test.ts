import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FeatureCollection } from 'geojson'

const mockReadOcad = vi.fn()
const mockOcadToGeoJson = vi.fn()

vi.mock('ocad2geojson', () => ({
  readOcad: mockReadOcad,
  ocadToGeoJson: mockOcadToGeoJson,
}))

describe('convertOcadToGeoJson', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns a JSON buffer of the GeoJSON feature collection', async () => {
    const fakeOcadFile = { parsed: true }
    const fakeGeoJson: FeatureCollection = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} }],
    }
    mockReadOcad.mockResolvedValue(fakeOcadFile)
    mockOcadToGeoJson.mockReturnValue(fakeGeoJson)

    const { convertOcadToGeoJson } = await import('./ocad')
    const result = await convertOcadToGeoJson(Buffer.from('ocad-data'))

    expect(mockReadOcad).toHaveBeenCalled()
    expect(mockOcadToGeoJson).toHaveBeenCalledWith(fakeOcadFile)
    expect(JSON.parse(result.toString('utf-8'))).toEqual(fakeGeoJson)
  })
})
