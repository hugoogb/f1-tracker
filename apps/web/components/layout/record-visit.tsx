'use client'

import { useEffect } from 'react'

import { recordVisit, type RecentItem } from '@/lib/recently-viewed'

export function RecordVisit({ href, label, kind, color }: RecentItem) {
  useEffect(() => {
    recordVisit({ href, label, kind, color })
  }, [href, label, kind, color])
  return null
}
