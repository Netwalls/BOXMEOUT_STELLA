// ============================================================
// BOXMEOUT — Root Layout
// Wraps all pages with Header and global providers.
// ============================================================

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Header } from '../components/layout/Header';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'BOXMEOUT — Boxing Prediction Market on Stellar',
  description: 'Decentralized boxing prediction market powered by Stellar Soroban smart contracts.',
};

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="en" className={inter.className}>
      <body className="bg-gray-950 text-white min-h-screen">
        <Header />
        {children}
      </body>
    </html>
  );
}
