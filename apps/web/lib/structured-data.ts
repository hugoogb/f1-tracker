import { SITE_NAME, SITE_DESCRIPTION, absoluteUrl } from './seo'

type Thing = Record<string, unknown>

/** Site-level entity: enables the sitelinks search box and the brand name. */
export function websiteSchema(): Thing {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${absoluteUrl('/')}#website`,
    name: SITE_NAME,
    alternateName: 'Formula 1 Tracker',
    url: absoluteUrl('/'),
    description: SITE_DESCRIPTION,
    inLanguage: 'en',
  }
}

export function breadcrumbSchema(items: { label: string; href?: string }[]): Thing {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.label,
      ...(item.href ? { item: absoluteUrl(item.href) } : {}),
    })),
  }
}

export function personSchema(input: {
  name: string
  path: string
  nationality?: string | null
  dateOfBirth?: string | null
  permanentNumber?: string | number | null
}): Thing {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: input.name,
    url: absoluteUrl(input.path),
    jobTitle: 'Formula 1 Driver',
    ...(input.nationality ? { nationality: input.nationality } : {}),
    ...(input.dateOfBirth ? { birthDate: input.dateOfBirth } : {}),
    ...(input.permanentNumber ? { identifier: String(input.permanentNumber) } : {}),
  }
}

export function organizationSchema(input: {
  name: string
  path: string
  nationality?: string | null
}): Thing {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsOrganization',
    name: input.name,
    url: absoluteUrl(input.path),
    sport: 'Formula 1',
    ...(input.nationality ? { areaServed: input.nationality } : {}),
  }
}

export function placeSchema(input: {
  name: string
  path: string
  locality?: string | null
  country?: string | null
  latitude?: number | null
  longitude?: number | null
}): Thing {
  return {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: input.name,
    url: absoluteUrl(input.path),
    ...(input.locality || input.country
      ? {
          address: {
            '@type': 'PostalAddress',
            ...(input.locality ? { addressLocality: input.locality } : {}),
            ...(input.country ? { addressCountry: input.country } : {}),
          },
        }
      : {}),
    ...(typeof input.latitude === 'number' && typeof input.longitude === 'number'
      ? { geo: { '@type': 'GeoCoordinates', latitude: input.latitude, longitude: input.longitude } }
      : {}),
  }
}

export function raceSchema(input: {
  name: string
  path: string
  startDate?: string | null
  circuitName?: string | null
  locality?: string | null
  country?: string | null
}): Thing {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: input.name,
    url: absoluteUrl(input.path),
    sport: 'Formula 1',
    ...(input.startDate ? { startDate: input.startDate } : {}),
    ...(input.circuitName
      ? {
          location: {
            '@type': 'Place',
            name: input.circuitName,
            ...(input.locality || input.country
              ? {
                  address: {
                    '@type': 'PostalAddress',
                    ...(input.locality ? { addressLocality: input.locality } : {}),
                    ...(input.country ? { addressCountry: input.country } : {}),
                  },
                }
              : {}),
          },
        }
      : {}),
  }
}
