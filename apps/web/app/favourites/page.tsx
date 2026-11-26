import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { PageHero } from '@/components/ui/page-hero'
import { FavouritesView } from '@/components/favourites/favourites-view'
import { buildMetadata } from '@/lib/seo'

export const metadata = buildMetadata({
  title: 'Favourites',
  description:
    'The drivers, constructors and circuits you have starred, kept in this browser alone — no account, no server, nothing that identifies you.',
  path: '/favourites',
  noindex: true,
})

export default function FavouritesPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Favourites' }]} />
      <PageHero
        eyebrow="On this device"
        title="Favourites"
        description="Starred drivers, constructors and circuits. They are saved in this browser only — no account, and nothing is sent anywhere."
      />
      <FavouritesView />
    </div>
  )
}
