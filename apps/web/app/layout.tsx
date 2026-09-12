import type { Metadata, Viewport } from 'next'
import { Plus_Jakarta_Sans, Orbitron, JetBrains_Mono } from 'next/font/google'
import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'
import { JsonLd } from '@/components/seo/json-ld'
import { websiteSchema } from '@/lib/structured-data'
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL, THEME_COLOR, absoluteUrl } from '@/lib/seo'
import './globals.css'

const plusJakarta = Plus_Jakarta_Sans({
  variable: '--font-plus-jakarta',
  subsets: ['latin'],
})

const orbitron = Orbitron({
  variable: '--font-orbitron',
  subsets: ['latin'],
})

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  // Without this, every relative canonical/Open Graph URL below resolves
  // against localhost and Next logs a build-time warning.
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Formula 1 history, stats and analytics`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: 'hugoogb', url: 'https://github.com/hugoogb' }],
  creator: 'hugoogb',
  publisher: 'hugoogb',
  keywords: [
    'Formula 1',
    'F1',
    'F1 stats',
    'F1 statistics',
    'F1 history',
    'race results',
    'driver standings',
    'constructor standings',
    'Grand Prix',
    'F1 records',
    'driver comparison',
    'F1 circuits',
  ],
  category: 'sports',
  alternates: { canonical: absoluteUrl('/') },
  // Phone-number autolinking mangles lap times and car numbers on iOS Safari.
  formatDetection: { telephone: false, date: false, address: false, email: false },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  openGraph: {
    title: `${SITE_NAME} — Formula 1 history, stats and analytics`,
    description: SITE_DESCRIPTION,
    url: absoluteUrl('/'),
    siteName: SITE_NAME,
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — Formula 1 history, stats and analytics`,
    description: SITE_DESCRIPTION,
  },
}

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
  colorScheme: 'dark',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${plusJakarta.variable} ${orbitron.variable} ${jetbrainsMono.variable} flex min-h-screen flex-col font-sans antialiased`}
      >
        <JsonLd data={websiteSchema()} />
        <a
          href="#main-content"
          className="focus:bg-background focus:text-foreground focus:ring-ring sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded focus:px-4 focus:py-2 focus:ring-2"
        >
          Skip to main content
        </a>
        <Header />
        <main id="main-content" className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-10 md:px-8">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  )
}
