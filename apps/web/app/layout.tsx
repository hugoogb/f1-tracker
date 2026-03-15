import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, Orbitron, JetBrains_Mono } from 'next/font/google'
import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'
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
  title: {
    default: 'F1 Tracker',
    template: '%s | F1 Tracker',
  },
  description:
    'Explore the complete history of Formula 1 with interactive analytics and visualizations',
  openGraph: {
    title: 'F1 Tracker',
    description:
      'Explore the complete history of Formula 1 with interactive analytics and visualizations',
    siteName: 'F1 Tracker',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'F1 Tracker',
    description:
      'Explore the complete history of Formula 1 with interactive analytics and visualizations',
  },
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
