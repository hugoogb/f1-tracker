import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { PageHeader } from '@/components/ui/page-header'
import { FavouritesView } from '@/components/favourites/favourites-view'
import { buildMetadata } from '@/lib/seo'

/**
 * Per-viewer content with nothing in it for a crawler — and nothing a crawler
 * could even see, since the list lives in the viewer's own `localStorage`. The
 * page is kept out of the index and out of `sitemap.ts` for the same reason.
 */
export const metadata = buildMetadata({
  title: 'Favourites',
  description:
    'The drivers, constructors and circuits you have starred, kept in this browser alone — no account, no server, nothing that identifies you.',
  path: '/favourites',
  noindex: true,
})

export default function FavouritesPage() {
  // Everything below the header is client state, so the server renders the
  // chrome and the view's own skeleton — never a guess at what is stored.
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Home', href: '/' }, { label: 'Favourites' }]} />
      <PageHeader
        title="Favourites"
        description="Starred drivers, constructors and circuits. They are saved in this browser only — no account, and nothing is sent anywhere."
      />
      <FavouritesView />
    </div>
  )
}
