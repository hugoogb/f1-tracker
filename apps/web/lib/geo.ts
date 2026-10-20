/**
 * Great-circle geometry for the season calendar map.
 *
 * Mirrors `pipeline/src/geo.py` — same mean radius, same haversine — so the
 * distance the API reports and the arc the map draws describe the same line.
 * Written out rather than pulled from a geodesy package: it is thirty lines,
 * and a sphere is all a "km travelled" figure can honestly claim.
 */

export type LatLng = [lat: number, lng: number]

/** Mean Earth radius (IUGG), km. */
export const EARTH_RADIUS_KM = 6371.0088

/** Equatorial circumference, km — "how many times round the world". */
export const EARTH_CIRCUMFERENCE_KM = 40_075

const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

/** Haversine distance in km. */
export function greatCircleKm([lat1, lng1]: LatLng, [lat2, lng2]: LatLng): number {
  const phi1 = toRad(lat1)
  const phi2 = toRad(lat2)
  const dPhi = phi2 - phi1
  const dLambda = toRad(lng2 - lng1)
  const h = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Points along the great circle from `a` to `b`, both ends included.
 *
 * Spherical linear interpolation between the two unit vectors. The sample count
 * scales with distance so a Monaco–Barcelona hop is not drawn with as many
 * vertices as a Las Vegas–Qatar haul. Longitudes are unwrapped (each point is
 * kept within 180° of the previous one) so a leg over the antimeridian stays a
 * continuous line — `splitAtAntimeridian` folds it back for drawing.
 */
export function greatCirclePath(a: LatLng, b: LatLng): LatLng[] {
  const km = greatCircleKm(a, b)
  const steps = Math.max(8, Math.min(128, Math.round(km / 120)))

  const [lat1, lng1] = [toRad(a[0]), toRad(a[1])]
  const [lat2, lng2] = [toRad(b[0]), toRad(b[1])]
  const x1 = Math.cos(lat1) * Math.cos(lng1)
  const y1 = Math.cos(lat1) * Math.sin(lng1)
  const z1 = Math.sin(lat1)
  const x2 = Math.cos(lat2) * Math.cos(lng2)
  const y2 = Math.cos(lat2) * Math.sin(lng2)
  const z2 = Math.sin(lat2)
  const omega = Math.acos(Math.max(-1, Math.min(1, x1 * x2 + y1 * y2 + z1 * z2)))

  if (omega < 1e-9) return [a, b]

  const sinOmega = Math.sin(omega)
  const points: LatLng[] = []
  let previousLng = a[1]
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const k1 = Math.sin((1 - t) * omega) / sinOmega
    const k2 = Math.sin(t * omega) / sinOmega
    const x = k1 * x1 + k2 * x2
    const y = k1 * y1 + k2 * y2
    const z = k1 * z1 + k2 * z2
    const lat = toDeg(Math.atan2(z, Math.hypot(x, y)))
    let lng = toDeg(Math.atan2(y, x))
    while (lng - previousLng > 180) lng -= 360
    while (lng - previousLng < -180) lng += 360
    previousLng = lng
    points.push([lat, lng])
  }
  // Pin the ends to the exact inputs so the line meets its markers.
  points[0] = a
  points[points.length - 1] = [b[0], points[points.length - 1][1]]
  return points
}

/** Bring a longitude back into [-180, 180). */
export function normaliseLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180
}

/**
 * Cut an unwrapped path into runs that each stay inside [-180, 180], adding the
 * crossing point to both sides — the map only draws one copy of the world.
 */
export function splitAtAntimeridian(path: LatLng[]): LatLng[][] {
  if (path.length === 0) return []
  const runs: LatLng[][] = []
  let offset = Math.round(path[0][1] / 360) * 360
  let run: LatLng[] = [[path[0][0], path[0][1] - offset]]

  for (let i = 1; i < path.length; i++) {
    const [lat0, lng0] = path[i - 1]
    const [lat1, lng1] = path[i]
    const nextOffset = Math.round(lng1 / 360) * 360
    if (nextOffset !== offset) {
      // The edge between the two zones sits at offset ± 180.
      const edge = nextOffset > offset ? offset + 180 : offset - 180
      const t = (edge - lng0) / (lng1 - lng0)
      const lat = lat0 + (lat1 - lat0) * t
      run.push([lat, edge - offset])
      runs.push(run)
      run = [[lat, edge - nextOffset]]
      offset = nextOffset
    }
    run.push([lat1, lng1 - offset])
  }
  runs.push(run)
  return runs
}

/**
 * The first `fraction` of a path, measured along its vertices, ending on an
 * interpolated point so a progressive reveal moves smoothly between samples.
 */
export function pathPrefix(path: LatLng[], fraction: number): LatLng[] {
  if (path.length < 2 || fraction <= 0) return path.slice(0, 1)
  if (fraction >= 1) return path
  const exact = fraction * (path.length - 1)
  const whole = Math.floor(exact)
  const t = exact - whole
  const [lat0, lng0] = path[whole]
  const [lat1, lng1] = path[whole + 1]
  return [...path.slice(0, whole + 1), [lat0 + (lat1 - lat0) * t, lng0 + (lng1 - lng0) * t]]
}

/** The point `fraction` of the way along a path (same parameterisation as `pathPrefix`). */
export function pointAlong(path: LatLng[], fraction: number): LatLng {
  const prefix = pathPrefix(path, Math.max(0, Math.min(1, fraction)))
  const [lat, lng] = prefix[prefix.length - 1]
  return [lat, normaliseLng(lng)]
}
