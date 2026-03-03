import { describe, expect, it } from 'vitest'
import {
  computeImageCorners,
  computeWorldFile,
  selectTransformType,
  type ControlPoint,
  type WorldFile,
} from './transform'

// ---------------------------------------------------------------------------
// Fixture: simple isotropic mapping
//   (0,0)    → (0°, 0°)
//   (1000,0) → (1°, 0°)   ⟹ scaleX = 0.001
//   (0,1000) → (0°, −1°)  ⟹ scaleY = −0.001
// ---------------------------------------------------------------------------
const BASE_POINTS: ControlPoint[] = [
  { mapX: 0, mapY: 0, lng: 0, lat: 0 },
  { mapX: 1000, mapY: 0, lng: 1, lat: 0 },
  { mapX: 0, mapY: 1000, lng: 0, lat: -1 },
]

const EXTRA_POINTS: ControlPoint[] = [
  { mapX: 500, mapY: 500, lng: 0.5, lat: -0.5 },
  { mapX: 1000, mapY: 1000, lng: 1, lat: -1 },
]

const ALL_5 = [...BASE_POINTS, ...EXTRA_POINTS]
const ALL_6: ControlPoint[] = [
  ...ALL_5,
  { mapX: 200, mapY: 800, lng: 0.2, lat: -0.8 },
]
const ALL_10: ControlPoint[] = [
  ...ALL_6,
  { mapX: 300, mapY: 100, lng: 0.3, lat: -0.1 },
  { mapX: 700, mapY: 200, lng: 0.7, lat: -0.2 },
  { mapX: 100, mapY: 600, lng: 0.1, lat: -0.6 },
  { mapX: 900, mapY: 400, lng: 0.9, lat: -0.4 },
]

// ---------------------------------------------------------------------------
// selectTransformType
// ---------------------------------------------------------------------------
describe('selectTransformType', () => {
  it('returns affine for 3 points', () => expect(selectTransformType(3)).toBe('affine'))
  it('returns affine for 5 points', () => expect(selectTransformType(5)).toBe('affine'))
  it('returns tps for 6 points', () => expect(selectTransformType(6)).toBe('tps'))
  it('returns tps for 10 points', () => expect(selectTransformType(10)).toBe('tps'))
})

// ---------------------------------------------------------------------------
// Affine (3 points)
// ---------------------------------------------------------------------------
describe('computeWorldFile — affine (3 pts)', () => {
  it('produces correct world file coefficients', () => {
    const { worldFile, transformType } = computeWorldFile(BASE_POINTS)
    expect(transformType).toBe('affine')
    expect(worldFile.scaleX).toBeCloseTo(0.001, 6)
    expect(worldFile.scaleY).toBeCloseTo(-0.001, 6)
    expect(worldFile.transX).toBeCloseTo(0, 6)
    expect(worldFile.transY).toBeCloseTo(0, 6)
    expect(worldFile.rotX).toBeCloseTo(0, 6)
    expect(worldFile.rotY).toBeCloseTo(0, 6)
  })

  it('forward-maps each control point to its target', () => {
    const { worldFile } = computeWorldFile(BASE_POINTS)
    for (const pt of BASE_POINTS) {
      const lng = worldFile.transX + pt.mapX * worldFile.scaleX + pt.mapY * worldFile.rotX
      const lat = worldFile.transY + pt.mapX * worldFile.rotY + pt.mapY * worldFile.scaleY
      expect(lng).toBeCloseTo(pt.lng, 6)
      expect(lat).toBeCloseTo(pt.lat, 6)
    }
  })
})

// ---------------------------------------------------------------------------
// Affine (5 points — over-determined)
// ---------------------------------------------------------------------------
describe('computeWorldFile — affine (5 pts, over-determined)', () => {
  it('converges and forward-maps control points within 1e-6', () => {
    const { worldFile, transformType } = computeWorldFile(ALL_5)
    expect(transformType).toBe('affine')
    for (const pt of ALL_5) {
      const lng = worldFile.transX + pt.mapX * worldFile.scaleX + pt.mapY * worldFile.rotX
      const lat = worldFile.transY + pt.mapX * worldFile.rotY + pt.mapY * worldFile.scaleY
      expect(lng).toBeCloseTo(pt.lng, 6)
      expect(lat).toBeCloseTo(pt.lat, 6)
    }
  })
})

// ---------------------------------------------------------------------------
// TPS (6 points)
// ---------------------------------------------------------------------------
describe('computeWorldFile — TPS (6 pts)', () => {
  it('returns tps transform type', () => {
    const { transformType } = computeWorldFile(ALL_6)
    expect(transformType).toBe('tps')
  })

  it('affine part recovers correct scale', () => {
    const { worldFile } = computeWorldFile(ALL_6)
    expect(worldFile.scaleX).toBeCloseTo(0.001, 4)
    expect(worldFile.scaleY).toBeCloseTo(-0.001, 4)
  })

  it('produces no NaN in world file', () => {
    const { worldFile } = computeWorldFile(ALL_6)
    for (const v of Object.values(worldFile)) {
      expect(Number.isNaN(v)).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// TPS (10 points)
// ---------------------------------------------------------------------------
describe('computeWorldFile — TPS (10 pts)', () => {
  it('returns tps and no NaN', () => {
    const { worldFile, transformType } = computeWorldFile(ALL_10)
    expect(transformType).toBe('tps')
    for (const v of Object.values(worldFile)) {
      expect(Number.isNaN(v)).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// computeImageCorners
// ---------------------------------------------------------------------------
describe('computeImageCorners', () => {
  const wf: WorldFile = {
    transX: 0,
    scaleX: 0.001,
    rotX: 0,
    transY: 0,
    rotY: 0,
    scaleY: -0.001,
  }

  it('topLeft maps to origin', () => {
    const { topLeft } = computeImageCorners(wf, 1000, 1000)
    expect(topLeft[0]).toBeCloseTo(0, 6)
    expect(topLeft[1]).toBeCloseTo(0, 6)
  })

  it('topRight maps to (1, 0)', () => {
    const { topRight } = computeImageCorners(wf, 1000, 1000)
    expect(topRight[0]).toBeCloseTo(1, 6)
    expect(topRight[1]).toBeCloseTo(0, 6)
  })

  it('bottomLeft maps to (0, −1)', () => {
    const { bottomLeft } = computeImageCorners(wf, 1000, 1000)
    expect(bottomLeft[0]).toBeCloseTo(0, 6)
    expect(bottomLeft[1]).toBeCloseTo(-1, 6)
  })

  it('bottomRight maps to (1, −1)', () => {
    const { bottomRight } = computeImageCorners(wf, 1000, 1000)
    expect(bottomRight[0]).toBeCloseTo(1, 6)
    expect(bottomRight[1]).toBeCloseTo(-1, 6)
  })
})

// ---------------------------------------------------------------------------
// computeWorldFile — dispatches correctly
// ---------------------------------------------------------------------------
describe('computeWorldFile dispatch', () => {
  it('dispatches affine for ≤5 pts', () => {
    expect(computeWorldFile(BASE_POINTS).transformType).toBe('affine')
    expect(computeWorldFile(ALL_5).transformType).toBe('affine')
  })

  it('dispatches tps for ≥6 pts', () => {
    expect(computeWorldFile(ALL_6).transformType).toBe('tps')
    expect(computeWorldFile(ALL_10).transformType).toBe('tps')
  })

  it('throws for fewer than 3 points', () => {
    expect(() => computeWorldFile(BASE_POINTS.slice(0, 2))).toThrow()
  })
})
