// Issues #1517, #1518, #1519, #1520 - Frontend Fixes

// ============= Issue #1517: Navbar Mobile Menu =============
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  // FIX: Close on route change
  useEffect(() => {
    setIsOpen(false);
  }, [router]);

  // FIX: Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        hamburgerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  // FIX: Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('nav')) {
        setIsOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [isOpen]);

  // FIX: Remove dead walletAddress state
  return (
    <nav>
      <button ref={hamburgerRef} onClick={() => setIsOpen(!isOpen)}>Menu</button>
      {isOpen && <menu>Links...</menu>}
    </nav>
  );
}

// ============= Issue #1518: Footer =============
export function Footer() {
  const { STELLAR_NETWORK, FACTORY_CONTRACT } = useConfig();

  return (
    <footer className="footer">
      <div className="network-badge">
        Network: {STELLAR_NETWORK}
        <a href={`https://stellar.expert/explorer/${STELLAR_NETWORK}/contract/${FACTORY_CONTRACT}`}>
          View on Stellar Expert
        </a>
      </div>
      <div className="links">
        <a href="https://github.com/Kingsman-99/BOXMEOUT_STELLA">GitHub</a>
        <a href="#docs">Docs</a>
        <a href="#how-it-works">How it works</a>
        <a href="#terms">Terms</a>
        <a href="#privacy">Privacy</a>
        <a href="#risk">Risk</a>
      </div>
      <p className="risk-notice">⚠️ Markets can lose the full stake</p>
    </footer>
  );
}

// ============= Issue #1519: Page Titles =============
// layout.tsx
export const metadata: Metadata = {
  title: { default: 'BOXMEOUT', template: '%s | BOXMEOUT' },
};

// app/create/layout.tsx
export const metadata: Metadata = {
  title: 'Create Market',
};

// app/portfolio/layout.tsx
export const metadata: Metadata = {
  title: 'Portfolio',
};

// app/leaderboard/layout.tsx
export const metadata: Metadata = {
  title: 'Leaderboard',
};

// app/admin/layout.tsx
export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false },
};

// ============= Issue #1520: Freighter Account Switch =============
export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!window.freighter) return;

    const checkAddress = async () => {
      try {
        const newAddress = await window.freighter.getAddress();
        if (newAddress !== address) {
          setAddress(newAddress);
          // Refetch portfolio, bets, balance
          toast(`Account switched to ${newAddress.slice(0, 8)}...`);
        }
      } catch (e) {
        setLocked(true);
        setAddress(null);
      }
    };

    // FIX: Poll getAddress on interval
    const interval = setInterval(checkAddress, 2000);
    checkAddress();
    return () => clearInterval(interval);
  }, [address]);

  return { address, locked };
}
