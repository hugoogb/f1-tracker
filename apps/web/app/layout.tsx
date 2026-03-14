import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'F1 Tracker',
  description:
    'Explore the complete history of Formula 1 with interactive analytics and visualizations',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col antialiased`}
      >
        <a
          href="#main-content"
          className="focus:bg-background focus:text-foreground focus:ring-ring sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded focus:px-4 focus:py-2 focus:ring-2"
        >
          Skip to main content
        </a>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <Header />
          <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
            {children}
          </main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  )
}
