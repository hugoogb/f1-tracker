import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/seo'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Only the revalidate webhook is blocked here. The comparison pages are
        // kept crawlable on purpose and carry `noindex` instead — a disallowed
        // URL is never fetched, so its noindex would never be seen.
        disallow: ['/api/'],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}
