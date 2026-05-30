// ============================================================
// BOXMEOUT — Root Layout
// Wraps all pages with Header and global providers.
// ============================================================

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Header } from '../components/layout/Header';
import { QueryProvider } from '../providers/QueryProvider';
import { ToastProvider } from '../components/ui/ToastProvider';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'BoxMeOut — Boxing Prediction Markets',
    template: '%s — BoxMeOut',
  },
  description: 'Decentralized boxing prediction market powered by Stellar Soroban smart contracts.',
  openGraph: {
    siteName: 'BoxMeOut',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="en" className={inter.className}>
      {/* Inline script runs before paint to set dark/light class — prevents flash */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('boxmeout_theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');})();`,
          }}
        />
      </head>
      <body className="bg-gray-950 dark:bg-gray-950 text-white dark:text-white min-h-screen">
        <QueryProvider>
          <ToastProvider>
            <Header />
            {children}
          </ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
