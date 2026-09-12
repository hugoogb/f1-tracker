import { buildMetadata } from '@/lib/seo'

export const metadata = buildMetadata({
  title: 'Compare',
  description:
    'Compare any two Formula 1 drivers or constructors head-to-head — career stats, race and qualifying head-to-heads, teammate seasons and points by season.',
  path: '/compare',
})

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return children
}
