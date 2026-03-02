import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { QueryProvider } from '@/components/providers/query-provider';
import { Toaster } from '@/components/ui/sonner';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Zyphron - Universal Deployment Platform',
    template: '%s | Zyphron',
  },
  description: 'Next-Generation Universal Deployment Platform. Deploy any application, any language, anywhere.',
  keywords: ['deployment', 'platform', 'hosting', 'cloud', 'docker', 'kubernetes'],
  authors: [{ name: 'Zyphron' }],
  creator: 'Zyphron',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://zyphron.dev',
    title: 'Zyphron - Universal Deployment Platform',
    description: 'Next-Generation Universal Deployment Platform',
    siteName: 'Zyphron',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Zyphron - Universal Deployment Platform',
    description: 'Next-Generation Universal Deployment Platform',
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            {children}
            <Toaster position="bottom-right" />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
