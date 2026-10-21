import { NextResponse } from 'next/server'

import { api } from '@/lib/api'

/**
 * `/seasons/current` → the latest season's page.
 *
 * The header links here because it renders on every page and must not fetch
 * the season list itself: that endpoint is tagged `f1-global`, and a fetch's
 * tags become the tags of every page that reads it. The lookup is `no-store`
 * (no Data Cache entry, which is billed per write) and the redirect is cached
 * by the CDN instead, which is free. A static segment wins over `[year]`.
 */
export async function GET(request: Request) {
  let target = '/seasons'
  try {
    const seasons = await api.seasons.listUncached()
    const latest = seasons.data[0]?.year
    if (latest) target = `/seasons/${latest}`
  } catch {
    // The season list is the fallback destination.
  }
  const response = NextResponse.redirect(new URL(target, request.url), 307)
  response.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
  return response
}
