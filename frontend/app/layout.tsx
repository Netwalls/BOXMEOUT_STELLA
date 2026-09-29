import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { ToastProvider } from '@/components/ToastProvider';
import { NetworkMismatchBanner } from '@/components/NetworkMismatchBanner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ThemeScript } from '@/components/ThemeScript';
import { MotionConfigProvider } from '@/components/MotionConfigProvider';
import { WalletProvider } from '@/hooks/useWallet';
import '@/app/globals.css';

export const metadata: Metadata = {
  title: 'BOXMEOUT — Boxing Prediction Market',
  description: 'Decentralized boxing prediction market on Stellar',
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
                <NetworkMismatchBanner />
                <Navbar />
                <main className="min-w-0 overflow-x-hidden">
                  {children}
                </main>
              </ToastProvider>
            </WalletProvider>
          </ErrorBoundary>
        </MotionConfigProvider>
      </body>
    </html>
  );
}
