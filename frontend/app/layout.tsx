import type { Metadata } from 'next';
import { Navbar } from '@/components/Navbar';
import { ToastProvider } from '@/components/ToastProvider';
import { NetworkMismatchBanner } from '@/components/NetworkMismatchBanner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ThemeScript } from '@/components/ThemeScript';
import { WalletProvider } from '@/components/WalletProvider';
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
      </body>
    </html>
  );
}
