import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { ToastProvider } from '@/components/ToastProvider';
import { NetworkMismatchBanner } from '@/components/NetworkMismatchBanner';
import { MarketStatusNotifier } from '@/components/MarketStatusNotifier';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ThemeScript } from '@/components/ThemeScript';
import { MotionConfigProvider } from '@/components/MotionConfigProvider';
import { WalletProvider } from '@/hooks/useWallet';
import { SkipToContent } from '@/components/SkipToContent';
import { RouteAnnouncer } from '@/components/RouteAnnouncer';
import '@/app/globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'BOXMEOUT — Boxing Prediction Market',
    template: '%s | BOXMEOUT',
  },
  description: 'Decentralized boxing prediction market on Stellar',
  applicationName: 'BOXMEOUT',
  keywords: ['boxing', 'prediction market', 'Stellar', 'Soroban', 'XLM', 'crypto betting'],
  authors: [{ name: 'BOXMEOUT' }],
  creator: 'BOXMEOUT',
  publisher: 'BOXMEOUT',
  manifest: '/manifest.webmanifest',
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: 'BOXMEOUT',
    title: 'BOXMEOUT — Boxing Prediction Market',
    description: 'Decentralized boxing prediction market on Stellar',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BOXMEOUT — Boxing Prediction Market',
    description: 'Decentralized boxing prediction market on Stellar',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <ThemeScript />
      </head>
      <body>
        {/*
          MotionConfigProvider wraps the entire app so that framer-motion
          respects the user's prefers-reduced-motion OS preference
          (reducedMotion="user" delegates to the media query).
        */}
        <MotionConfigProvider>
          <ErrorBoundary>
            <WalletProvider>
              <ToastProvider>
                <SkipToContent />
                <NetworkMismatchBanner />
                <Navbar />
                <RouteAnnouncer />
                <main id="main" tabIndex={-1} className="min-w-0 outline-none">
                  {children}
                </main>
                <MarketStatusNotifier />
              </ToastProvider>
            </WalletProvider>
          </ErrorBoundary>
        </MotionConfigProvider>
      </body>
    </html>
  );
}
