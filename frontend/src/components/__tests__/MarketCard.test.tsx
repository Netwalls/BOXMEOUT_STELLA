/**
 * Tests for MarketCard component (Issue #801)
 *
 * Covers:
 *  - Correct rendering of fighter names
 *  - Correct status badge color per status
 *  - Countdown timer shows correct label
 *  - onClick navigation
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MarketCard } from '../market/MarketCard';
import type { Market, MarketStatus } from '../../types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('next/link', () => {
  const Link = ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  );
  Link.displayName = 'Link';
  return Link;
});

// Mock MarketOddsBar — not under test
jest.mock('../market/MarketOddsBar', () => ({
  MarketOddsBar: () => <div data-testid="odds-bar" />,
}));

// Mock CountdownTimer — control output per test
const mockCountdownState = jest.fn<string, []>();
jest.mock('../../hooks/useMarketCountdown', () => ({
  useMarketCountdown: () => mockCountdownState(),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeMarket(overrides: Partial<Market> = {}): Market {
  return {
    market_id: 'mkt-1',
    match_id: 'match-1',
    fighter_a: 'Canelo Alvarez',
    fighter_b: 'Gennady Golovkin',
    weight_class: 'Super Middleweight',
    title_fight: false,
    venue: 'T-Mobile Arena',
    scheduled_at: new Date(Date.now() + 3_600_000).toISOString(),
    status: 'open',
    outcome: null,
    pool_a: '500000000',
    pool_b: '300000000',
    pool_draw: '200000000',
    total_pool: '1000000000',
    odds_a: 5000,
    odds_b: 3000,
    odds_draw: 2000,
    fee_bps: 200,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MarketCard', () => {
  beforeEach(() => {
    mockCountdownState.mockReturnValue('2h 30m 00s');
  });

  describe('fighter names', () => {
    it('renders fighter_a name', () => {
      render(<MarketCard market={makeMarket()} />);
      expect(screen.getByText('Canelo Alvarez')).toBeInTheDocument();
    });

    it('renders fighter_b name', () => {
      render(<MarketCard market={makeMarket()} />);
      expect(screen.getByText('Gennady Golovkin')).toBeInTheDocument();
    });

    it('renders "vs" separator', () => {
      render(<MarketCard market={makeMarket()} />);
      expect(screen.getByText('vs')).toBeInTheDocument();
    });
  });

  describe('status badge colors', () => {
    const cases: Array<[MarketStatus, string]> = [
      ['open',      'bg-green-100'],
      ['locked',    'bg-amber-100'],
      ['resolved',  'bg-blue-100'],
      ['cancelled', 'bg-gray-100'],
      ['disputed',  'bg-red-100'],
    ];

    test.each(cases)('status "%s" renders badge with class %s', (status, expectedClass) => {
      render(<MarketCard market={makeMarket({ status })} />);
      const badge = screen.getByText(status.charAt(0).toUpperCase() + status.slice(1));
      expect(badge.className).toContain(expectedClass);
    });

    it('capitalizes the status text in the badge', () => {
      render(<MarketCard market={makeMarket({ status: 'open' })} />);
      expect(screen.getByText('Open')).toBeInTheDocument();
    });
  });

  describe('countdown timer', () => {
    it('shows countdown label with time remaining', () => {
      mockCountdownState.mockReturnValue('2h 30m 00s');
      render(<MarketCard market={makeMarket()} />);
      expect(screen.getByText(/starts in/i)).toBeInTheDocument();
      expect(screen.getByText(/2h 30m 00s/i)).toBeInTheDocument();
    });

    it('shows LIVE badge when fight has started', () => {
      mockCountdownState.mockReturnValue('LIVE');
      render(<MarketCard market={makeMarket()} />);
      expect(screen.getByText('LIVE')).toBeInTheDocument();
    });

    it('shows ENDED when fight is over', () => {
      mockCountdownState.mockReturnValue('ENDED');
      render(<MarketCard market={makeMarket()} />);
      expect(screen.getByText('ENDED')).toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('wraps the card in a link to the market detail page', () => {
      render(<MarketCard market={makeMarket({ market_id: 'mkt-42' })} />);
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/markets/mkt-42');
    });
  });

  describe('optional fields', () => {
    it('shows title fight badge when title_fight is true', () => {
      render(<MarketCard market={makeMarket({ title_fight: true })} />);
      expect(screen.getByText(/title fight/i)).toBeInTheDocument();
    });

    it('does not show title fight badge when title_fight is false', () => {
      render(<MarketCard market={makeMarket({ title_fight: false })} />);
      expect(screen.queryByText(/title fight/i)).not.toBeInTheDocument();
    });

    it('shows weight class', () => {
      render(<MarketCard market={makeMarket({ weight_class: 'Heavyweight' })} />);
      expect(screen.getByText('Heavyweight')).toBeInTheDocument();
    });

    it('shows total pool in XLM', () => {
      // total_pool 1000000000 stroops = 100 XLM
      render(<MarketCard market={makeMarket({ total_pool: '1000000000' })} />);
      expect(screen.getByText(/100.*xlm pooled/i)).toBeInTheDocument();
    });
  });
});
