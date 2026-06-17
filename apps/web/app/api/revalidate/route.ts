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
  const provided = auth?.startsWith('Bearer ') ? auth.slice(7) : ''

  if (!secret || !provided || !safeEqual(provided, secret)) {
    return NextResponse.json({ revalidated: false }, { status: 401 })
  }

  revalidateTag(F1_DATA_TAG, 'default')
  return NextResponse.json({ revalidated: true, tag: F1_DATA_TAG })
}
