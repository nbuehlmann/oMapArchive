export type ControlPoint = {
  mapX: number
  mapY: number
  lng: number
  lat: number
}

/**
 * World file coefficients mapping pixel (col, row) → (lng, lat):
 *   lng = transX + col·scaleX + row·rotX
 *   lat = transY + col·rotY   + row·scaleY
 */
export type WorldFile = {
  transX: number
  scaleX: number
  rotX: number
  transY: number
  rotY: number
  scaleY: number
}

export type TransformType = 'affine' | 'tps'

export const selectTransformType = (n: number): TransformType => (n <= 5 ? 'affine' : 'tps')

// ---------------------------------------------------------------------------
// Gaussian elimination with partial pivoting
// Mutates A and b in-place. Returns solution vector x such that A·x = b.
// ---------------------------------------------------------------------------

const solveLinear = (A: number[][], b: number[]): number[] => {
  const n = A.length
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxRow = col
    let maxVal = Math.abs(A[col]![col]!)
    for (let row = col + 1; row < n; row++) {
      const val = Math.abs(A[row]![col]!)
      if (val > maxVal) {
        maxVal = val
        maxRow = row
      }
    }
    // Swap rows
    ;[A[col], A[maxRow]] = [A[maxRow]!, A[col]!]
    ;[b[col], b[maxRow]] = [b[maxRow]!, b[col]!]

    const pivot = A[col]![col]!
    if (Math.abs(pivot) < 1e-12) continue

    for (let row = col + 1; row < n; row++) {
      const factor = A[row]![col]! / pivot
      for (let k = col; k < n; k++) {
        A[row]![k]! -= factor * A[col]![k]!
      }
      b[row]! -= factor * b[col]!
    }
  }
  // Back substitution
  const x = new Array<number>(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let sum = b[i]!
    for (let j = i + 1; j < n; j++) {
      sum -= A[i]![j]! * x[j]!
    }
    x[i] = sum / A[i]![i]!
  }
  return x
}

// ---------------------------------------------------------------------------
// Affine transform (3–5 points)
// Design matrix row: [1, mapX, mapY]
// Normal equations: (DᵀD)·c = Dᵀ·v  (3×3 system)
// ---------------------------------------------------------------------------

const computeAffineWorldFile = (pts: ControlPoint[]): WorldFile => {
  const n = pts.length

  // Accumulate DᵀD and Dᵀ·lng, Dᵀ·lat
  const AtA = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ] as number[][]
  const AtLng = [0, 0, 0]
  const AtLat = [0, 0, 0]

  for (let i = 0; i < n; i++) {
    const { mapX, mapY, lng, lat } = pts[i]!
    const row = [1, mapX, mapY]
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        AtA[r]![c]! += row[r]! * row[c]!
      }
      AtLng[r]! += row[r]! * lng
      AtLat[r]! += row[r]! * lat
    }
  }

  // Clone AtA for second solve (solveLinear mutates)
  const AtA2 = AtA.map((row) => [...row])

  const cLng = solveLinear(AtA, AtLng)
  const cLat = solveLinear(AtA2, AtLat)

  // cLng = [transX, scaleX, rotX], cLat = [transY, rotY, scaleY]
  return {
    transX: cLng[0]!,
    scaleX: cLng[1]!,
    rotX: cLng[2]!,
    transY: cLat[0]!,
    rotY: cLat[1]!,
    scaleY: cLat[2]!,
  }
}

// ---------------------------------------------------------------------------
// TPS transform (≥6 points)
// Solves the full (N+3)×(N+3) thin-plate spline system and returns the
// affine part (last 3 coefficients) as the world file.
// ---------------------------------------------------------------------------

const tpsKernel = (r2: number): number => (r2 < 1e-12 ? 0 : r2 * Math.log(r2))

const computeTpsWorldFile = (pts: ControlPoint[]): WorldFile => {
  const n = pts.length
  const m = n + 3 // system size

  // Build K matrix (n×n) and P matrix (n×3)
  const buildSystem = (): { A: number[][]; bLng: number[]; bLat: number[] } => {
    const A: number[][] = Array.from({ length: m }, () => new Array<number>(m).fill(0))
    const bLng = new Array<number>(m).fill(0)
    const bLat = new Array<number>(m).fill(0)

    // K block (top-left n×n)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const dx = pts[i]!.mapX - pts[j]!.mapX
        const dy = pts[i]!.mapY - pts[j]!.mapY
        A[i]![j] = tpsKernel(dx * dx + dy * dy)
      }
    }

    // P block (top-right n×3) and Pᵀ block (bottom-left 3×n)
    for (let i = 0; i < n; i++) {
      A[i]![n] = 1
      A[i]![n + 1] = pts[i]!.mapX
      A[i]![n + 2] = pts[i]!.mapY
      A[n]![i] = 1
      A[n + 1]![i] = pts[i]!.mapX
      A[n + 2]![i] = pts[i]!.mapY
      bLng[i] = pts[i]!.lng
      bLat[i] = pts[i]!.lat
    }

    return { A, bLng, bLat }
  }

  const { A, bLng, bLat } = buildSystem()
  // Need a second copy of A for the lat solve
  const A2 = buildSystem().A

  const solLng = solveLinear(A, bLng)
  const solLat = solveLinear(A2, bLat)

  // Affine part is at indices [n], [n+1], [n+2]
  return {
    transX: solLng[n]!,
    scaleX: solLng[n + 1]!,
    rotX: solLng[n + 2]!,
    transY: solLat[n]!,
    rotY: solLat[n + 1]!,
    scaleY: solLat[n + 2]!,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const computeWorldFile = (
  pts: ControlPoint[],
): { worldFile: WorldFile; transformType: TransformType } => {
  if (pts.length < 3) throw new Error('At least 3 control points required')
  const transformType = selectTransformType(pts.length)
  const worldFile =
    transformType === 'affine' ? computeAffineWorldFile(pts) : computeTpsWorldFile(pts)
  return { worldFile, transformType }
}

export const computeImageCorners = (
  wf: WorldFile,
  w: number,
  h: number,
): {
  topLeft: [number, number]
  topRight: [number, number]
  bottomRight: [number, number]
  bottomLeft: [number, number]
} => {
  const px = (col: number, row: number): [number, number] => [
    wf.transX + col * wf.scaleX + row * wf.rotX,
    wf.transY + col * wf.rotY + row * wf.scaleY,
  ]
  return {
    topLeft: px(0, 0),
    topRight: px(w, 0),
    bottomRight: px(w, h),
    bottomLeft: px(0, h),
  }
}
