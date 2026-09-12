import type { MetadataRoute } from 'next'
import { SITE_DESCRIPTION, SITE_NAME, THEME_COLOR } from '@/lib/seo'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — Formula 1 history, stats and analytics`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    // Matches the dark-first UI, so the splash screen does not flash white.
    background_color: '#0A0A0A',
    theme_color: THEME_COLOR,
    categories: ['sports', 'news', 'entertainment'],
    lang: 'en',
    dir: 'ltr',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
