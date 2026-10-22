// ============================================================
// BOXMEOUT — Root Layout
// Wraps all pages with Header and global providers.
// ============================================================

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Header } from '../components/layout/Header';

export const metadata: Metadata = {
  title: 'BOXMEOUT — Boxing Prediction Market on Stellar',
  description: 'Decentralized boxing prediction market powered by Stellar Soroban smart contracts.',
};

interface RootLayoutProps {
  children: ReactNode;
}

/**
 * Root layout applied to every page.
 *
 * Must wrap children with:
 *   - Global CSS / Tailwind base styles
 *   - Zustand store provider (if needed)
 *   - Header component
 *   - Main content area
 *
 * Font: use next/font to load Inter or a boxing-appropriate typeface.
 */
export default function RootLayout({ children }: RootLayoutProps): JSX.Element {
  return (
    <html lang="en">
      <body>
        <Header />
        {children}
      </body>
    </html>
  );
}
