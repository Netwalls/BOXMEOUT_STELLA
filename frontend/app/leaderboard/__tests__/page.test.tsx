import { render, screen } from '@testing-library/react';
import LeaderboardPage from '../page';

describe('Leaderboard Page', () => {
  it('shows loading state', () => {
    render(<LeaderboardPage />);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('displays leaderboard data', () => {
    render(<LeaderboardPage />);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('formats win rate correctly', () => {
    render(<LeaderboardPage />);
    expect(screen.getByText(/\d+%/)).toBeInTheDocument();
  });

  it('formats ROI correctly', () => {
    render(<LeaderboardPage />);
    expect(screen.getByText(/roi/i)).toBeInTheDocument();
  });
});
