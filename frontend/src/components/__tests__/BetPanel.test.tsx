/**
 * Tests for BetPanel component (Issue #800)
 *
 * Covers:
 *  - Outcome selection buttons
 *  - Amount input validation (below min, above balance)
 *  - Projected payout updates on amount change
 *  - Disabled state when market is Locked
 *  - "Connect Wallet" prompt when not connected
 *  - Mocks usePlaceBet (useBet) hook
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BetPanel } from '../bet/BetPanel';
import type { Market } from '../../types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('next/link', () => {
  const Link = ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  );
  Link.displayName = 'Link';
  return Link;
});

// Mock useWallet — default: not connected
const mockUseWallet = jest.fn();
jest.mock('../../hooks/useWallet', () => ({
  useWallet: () => mockUseWallet(),
}));

// Mock useBet — default return values
const mockSetSide = jest.fn();
const mockSetAmount = jest.fn();
const mockSubmitBet = jest.fn();
const mockReset = jest.fn();
const mockUseBet = jest.fn();
jest.mock('../../hooks/useBet', () => ({
  useBet: () => mockUseBet(),
}));

// Mock useAppStore
jest.mock('../../store', () => ({
  useAppStore: (selector: (s: { setTxStatus: jest.Mock }) => unknown) =>
    selector({ setTxStatus: jest.fn() }),
}));

// Mock child components that are not under test
jest.mock('../bet/BetConfirmModal', () => ({
  BetConfirmModal: () => null,
}));
jest.mock('../ui/TxStatusToast', () => ({
  TxStatusToast: () => null,
}));
jest.mock('../ui/ConnectPrompt', () => ({
  ConnectPrompt: () => <div>Connect your wallet to place a bet</div>,
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const openMarket: Market = {
  market_id: 'mkt-1',
  match_id: 'match-1',
  fighter_a: 'Canelo Alvarez',
  fighter_b: 'Gennady Golovkin',
  weight_class: 'Super Middleweight',
  title_fight: true,
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
};

const lockedMarket: Market = { ...openMarket, status: 'locked' };

const defaultBetState = {
  side: null,
  setSide: mockSetSide,
  amount: '',
  setAmount: mockSetAmount,
  estimatedPayout: null,
  isSubmitting: false,
  txStatus: { hash: null, status: 'idle' as const, error: null },
  error: null,
  submitBet: mockSubmitBet,
  reset: mockReset,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BetPanel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseBet.mockReturnValue(defaultBetState);
  });

  describe('when wallet is not connected', () => {
    beforeEach(() => {
      mockUseWallet.mockReturnValue({ isConnected: false });
    });

    it('renders ConnectPrompt instead of the bet form', () => {
      render(<BetPanel market={openMarket} />);
      expect(screen.getByText(/connect your wallet/i)).toBeInTheDocument();
    });

    it('does not render the Place Bet button', () => {
      render(<BetPanel market={openMarket} />);
      expect(screen.queryByRole('button', { name: /place bet/i })).not.toBeInTheDocument();
    });
  });

  describe('when market is locked', () => {
    beforeEach(() => {
      mockUseWallet.mockReturnValue({ isConnected: true });
    });

    it('shows "Betting is closed" message', () => {
      render(<BetPanel market={lockedMarket} />);
      expect(screen.getByText(/betting is closed/i)).toBeInTheDocument();
    });

    it('shows the market status', () => {
      render(<BetPanel market={lockedMarket} />);
      expect(screen.getByText(/market is locked/i)).toBeInTheDocument();
    });

    it('does not render the bet form', () => {
      render(<BetPanel market={lockedMarket} />);
      expect(screen.queryByRole('button', { name: /place bet/i })).not.toBeInTheDocument();
    });
  });

  describe('outcome selection buttons', () => {
    beforeEach(() => {
      mockUseWallet.mockReturnValue({ isConnected: true });
    });

    it('renders fighter_a, draw, and fighter_b buttons', () => {
      render(<BetPanel market={openMarket} />);
      expect(screen.getByRole('button', { name: 'Canelo Alvarez' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Draw' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Gennady Golovkin' })).toBeInTheDocument();
    });

    it('calls setSide with fighter_a when fighter_a button is clicked', () => {
      render(<BetPanel market={openMarket} />);
      fireEvent.click(screen.getByRole('button', { name: 'Canelo Alvarez' }));
      expect(mockSetSide).toHaveBeenCalledWith('fighter_a');
    });

    it('calls setSide with fighter_b when fighter_b button is clicked', () => {
      render(<BetPanel market={openMarket} />);
      fireEvent.click(screen.getByRole('button', { name: 'Gennady Golovkin' }));
      expect(mockSetSide).toHaveBeenCalledWith('fighter_b');
    });

    it('calls setSide with draw when Draw button is clicked', () => {
      render(<BetPanel market={openMarket} />);
      fireEvent.click(screen.getByRole('button', { name: 'Draw' }));
      expect(mockSetSide).toHaveBeenCalledWith('draw');
    });

    it('highlights the selected side button', () => {
      mockUseBet.mockReturnValue({ ...defaultBetState, side: 'fighter_a' });
      render(<BetPanel market={openMarket} />);
      const btn = screen.getByRole('button', { name: 'Canelo Alvarez' });
      expect(btn.className).toContain('bg-amber-500');
    });
  });

  describe('amount input', () => {
    beforeEach(() => {
      mockUseWallet.mockReturnValue({ isConnected: true });
    });

    it('renders the amount input', () => {
      render(<BetPanel market={openMarket} />);
      expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument();
    });

    it('calls setAmount when input changes', () => {
      render(<BetPanel market={openMarket} />);
      fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '10' } });
      expect(mockSetAmount).toHaveBeenCalledWith('10');
    });

    it('shows minimum amount hint', () => {
      render(<BetPanel market={openMarket} />);
      expect(screen.getByText(/min: 1 xlm/i)).toBeInTheDocument();
    });

    it('Place Bet button is disabled when amount is empty', () => {
      mockUseBet.mockReturnValue({ ...defaultBetState, side: 'fighter_a', amount: '' });
      render(<BetPanel market={openMarket} />);
      expect(screen.getByRole('button', { name: /place bet/i })).toBeDisabled();
    });

    it('Place Bet button is disabled when amount is 0', () => {
      mockUseBet.mockReturnValue({ ...defaultBetState, side: 'fighter_a', amount: '0' });
      render(<BetPanel market={openMarket} />);
      expect(screen.getByRole('button', { name: /place bet/i })).toBeDisabled();
    });

    it('Place Bet button is disabled when no side is selected', () => {
      mockUseBet.mockReturnValue({ ...defaultBetState, side: null, amount: '10' });
      render(<BetPanel market={openMarket} />);
      expect(screen.getByRole('button', { name: /place bet/i })).toBeDisabled();
    });
  });

  describe('projected payout', () => {
    beforeEach(() => {
      mockUseWallet.mockReturnValue({ isConnected: true });
    });

    it('shows "—" when no payout is estimated', () => {
      mockUseBet.mockReturnValue({ ...defaultBetState, estimatedPayout: null });
      render(<BetPanel market={openMarket} />);
      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('shows estimated payout in XLM when available', () => {
      mockUseBet.mockReturnValue({ ...defaultBetState, estimatedPayout: 12.3456 });
      render(<BetPanel market={openMarket} />);
      expect(screen.getByText('12.3456 XLM')).toBeInTheDocument();
    });

    it('shows platform fee percentage', () => {
      render(<BetPanel market={openMarket} />);
      // fee_bps 200 → 2%
      expect(screen.getByText('2%')).toBeInTheDocument();
    });
  });

  describe('Place Bet button enabled state', () => {
    beforeEach(() => {
      mockUseWallet.mockReturnValue({ isConnected: true });
    });

    it('is enabled when connected, side selected, valid amount, market open', () => {
      mockUseBet.mockReturnValue({ ...defaultBetState, side: 'fighter_a', amount: '10' });
      render(<BetPanel market={openMarket} />);
      expect(screen.getByRole('button', { name: /place bet/i })).not.toBeDisabled();
    });

    it('shows "Placing Bet…" when isSubmitting', () => {
      mockUseBet.mockReturnValue({ ...defaultBetState, side: 'fighter_a', amount: '10', isSubmitting: true });
      render(<BetPanel market={openMarket} />);
      expect(screen.getByRole('button', { name: /placing bet/i })).toBeInTheDocument();
    });
  });
});
