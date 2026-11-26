export type LatLng = [lat: number, lng: number]

export const EARTH_RADIUS_KM = 6371.0088

export const EARTH_CIRCUMFERENCE_KM = 40_075

const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

export function greatCircleKm([lat1, lng1]: LatLng, [lat2, lng2]: LatLng): number {
  const phi1 = toRad(lat1)
  const phi2 = toRad(lat2)
  const dPhi = phi2 - phi1
  const dLambda = toRad(lng2 - lng1)
  const h = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

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
  points[0] = a
  points[points.length - 1] = [b[0], points[points.length - 1][1]]
  return points
}
