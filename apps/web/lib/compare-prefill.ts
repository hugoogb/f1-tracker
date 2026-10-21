/**
 * `/compare` can be opened with one side already chosen, from a driver or
 * team page. The link carries the display name too, so the picker can show who
 * is selected without a lookup; an older link with only a ref shows the ref.
 */

export interface PrefillSide {
  ref: string
  name: string
}

export interface ComparePrefill {
  /** 0 = drivers tab, 1 = constructors tab. */
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

/** The link a driver or team page uses to start a comparison with itself. */
export function compareHref(kind: 'driver' | 'constructor', ref: string, name: string): string {
  const key = kind === 'driver' ? 'd1' : 'c1'
  return `/compare?${new URLSearchParams({ [key]: ref, [`${key}name`]: name })}`
}
