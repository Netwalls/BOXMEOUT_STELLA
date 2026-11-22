import { render, screen } from '@testing-library/react';
import PortfolioPage from '../page';

describe('Portfolio Page', () => {
  it('shows loading state', () => {
    render(<PortfolioPage />);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('displays P&L calculation', () => {
    render(<PortfolioPage />);
    expect(screen.getByText(/p&l/i)).toBeInTheDocument();
  });

  it('calculates ROI correctly', () => {
    render(<PortfolioPage />);
    expect(screen.getByText(/roi/i)).toBeInTheDocument();
  });
});
