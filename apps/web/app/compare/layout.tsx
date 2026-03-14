import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Compare Drivers | F1 Tracker',
  description: 'Compare two Formula 1 drivers head-to-head with career stats and season history',
}

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return children
}
