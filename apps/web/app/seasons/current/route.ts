import { NextResponse } from 'next/server'

import { api } from '@/lib/api'

export async function GET(request: Request) {
  const seasons = await api.seasons.listUncached().catch(() => null)
  const latest = seasons?.data[0]?.year
  const target = latest ? `/seasons/${latest}` : '/seasons'
  const response = NextResponse.redirect(new URL(target, request.url), 307)
  response.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
  return response
}
