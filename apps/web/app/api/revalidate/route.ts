import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { F1_DATA_TAG } from '@/lib/constants'

export const runtime = 'nodejs'

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export async function POST(request: Request) {
  const secret = process.env.REVALIDATE_SECRET
  const auth = request.headers.get('authorization')
  const provided = auth && auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''

  if (!secret || !provided || !safeEqual(provided, secret)) {
    return NextResponse.json({ revalidated: false }, { status: 401 })
  }

  try {
    // `{ expire: 0 }`, not 'max': this is called after new data has landed, and
    // 'max' is stale-while-revalidate — the next visitor would still be served
    // the old page while a background render ran, so a race page cached before
    // `pnpm fastf1` kept saying it had no lap times. Expiring makes that next
    // request render fresh, which is what an ingest webhook is for.
    revalidateTag(F1_DATA_TAG, { expire: 0 })
  } catch (err) {
    console.error('[revalidate] revalidateTag failed', err)
    return NextResponse.json(
      { revalidated: false, error: 'tag revalidation failed' },
      { status: 500 },
    )
  }
  return NextResponse.json({ revalidated: true, tag: F1_DATA_TAG })
}
