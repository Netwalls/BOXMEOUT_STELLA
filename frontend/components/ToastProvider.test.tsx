import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { ToastProvider, useToast, MAX_VISIBLE_TOASTS } from './ToastProvider';

let add: ReturnType<typeof useToast>['addToast'];

function Harness() {
  add = useToast().addToast;
  return null;
}

const renderProvider = () =>
  render(
    <ToastProvider>
      <Harness />
    </ToastProvider>
  );

describe('ToastProvider queue (F-153)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('collapses identical message and type within the window into one toast with a count', () => {
    renderProvider();
    act(() => add('Odds updated', 'info'));
    act(() => { jest.advanceTimersByTime(1000); });
    act(() => add('Odds updated', 'info'));
    act(() => add('Odds updated', 'info'));

    expect(screen.getAllByText(/Odds updated/)).toHaveLength(1);
    expect(screen.getByText('×3')).toBeInTheDocument();
  });

  it('does not collapse after the dedupe window has passed', () => {
    renderProvider();
    act(() => add('Odds updated', 'info'));
    act(() => { jest.advanceTimersByTime(4001); });
    act(() => add('Odds updated', 'info'));
    expect(screen.getAllByText(/Odds updated/)).toHaveLength(2);
  });

  it('does not collapse different types or messages', () => {
    renderProvider();
    act(() => add('Bet placed', 'success'));
    act(() => add('Bet placed', 'error'));
    act(() => add('Bet cancelled', 'success'));
    expect(screen.getAllByText(/Bet/)).toHaveLength(3);
  });

  it('keeps at most the newest toasts visible', () => {
    renderProvider();
    act(() => {
      for (let i = 1; i <= MAX_VISIBLE_TOASTS + 2; i++) add(`Message ${i}`, 'info');
    });
    expect(screen.queryByText('Message 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Message 2')).not.toBeInTheDocument();
    expect(screen.getByText(`Message ${MAX_VISIBLE_TOASTS + 2}`)).toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(MAX_VISIBLE_TOASTS);
  });
});
