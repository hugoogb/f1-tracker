export interface PrefillSide {
  ref: string
  name: string
}

export interface ComparePrefill {
  tab: 0 | 1
  d1: PrefillSide
  c1: PrefillSide
}

function side(params: Pick<URLSearchParams, 'get'>, key: 'd1' | 'c1'): PrefillSide {
  const ref = params.get(key) ?? ''
  if (!ref) return { ref: '', name: '' }
  return { ref, name: params.get(`${key}name`) || ref }
}

export function comparePrefill(params: Pick<URLSearchParams, 'get'>): ComparePrefill {
  const d1 = side(params, 'd1')
  const c1 = side(params, 'c1')
  return { tab: c1.ref && !d1.ref ? 1 : 0, d1, c1 }
}

export function compareHref(kind: 'driver' | 'constructor', ref: string, name: string): string {
  const key = kind === 'driver' ? 'd1' : 'c1'
  return `/compare?${new URLSearchParams({ [key]: ref, [`${key}name`]: name })}`
}
