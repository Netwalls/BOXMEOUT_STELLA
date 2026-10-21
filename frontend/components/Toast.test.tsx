import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Toast } from './Toast';

const renderToast = (toast, onDismiss = () => {}) => {
  return render(
    <Toast toast={toast} onDismiss={onDismiss} />
  );
};

describe('Toast', () => {
  const successToast = {
    id: 'success-1',
    type: 'success' as const,
    title: 'Success',
    message: 'Your action was completed successfully!',
  };

  const errorToast = {
    id: 'error-1',
    type: 'error' as const,
    title: 'Error',
    message: 'Something went wrong. Please try again.',
  };

  const infoToast = {
    id: 'info-1',
    type: 'info' as const,
    title: 'Information',
    message: 'This is an informational message.',
  };

  const errorWithoutTitleToast = {
    id: 'error-2',
    type: 'error' as const,
    message: 'Error occurred without title.',
  };

  it('renders success toast with correct styles', () => {
    const onDismiss = jest.fn();
    renderToast(successToast, onDismiss);
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('Your action was completed successfully!')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('renders error toast with correct styles', () => {
    const onDismiss = jest.fn();
    renderToast(errorToast, onDismiss);
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('renders info toast with correct styles', () => {
    const onDismiss = jest.fn();
    renderToast(infoToast, onDismiss);
    expect(screen.getByText('Information')).toBeInTheDocument();
    expect(screen.getByText('This is an informational message.')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('does not render title when not provided', () => {
    const onDismiss = jest.fn();
    renderToast(errorWithoutTitleToast, onDismiss);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByText('Error occurred without title.')).toBeInTheDocument();
  });

  it('calls onDismiss when close button is clicked', () => {
    const onDismiss = jest.fn();
    renderToast(successToast, onDismiss);
    fireEvent.click(screen.getByRole('button'));
    expect(onDismiss).toHaveBeenCalledWith('success-1');
  });

  it('auto-dismisses after 5 seconds', async () => {
    jest.useFakeTimers();
    const onDismiss = jest.fn();
    renderToast(successToast, onDismiss);
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(onDismiss).toHaveBeenCalledWith('success-1');
    jest.useRealTimers();
  });

  it('renders a link when href is provided', () => {
    const toastWithLink = {
      id: 'link-1',
      type: 'info' as const,
      message: 'Market resolved',
      href: '/markets/mkt-123',
    };
    renderToast(toastWithLink);
    const link = screen.getByRole('link', { name: /view market/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/markets/mkt-123');
  });

  it('renders and invokes action button when action is provided', () => {
    const handleAction = jest.fn();
    const toastWithAction = {
      id: 'action-1',
      type: 'success' as const,
      message: 'Alerts ready',
      action: {
        label: 'Enable desktop alerts',
        onClick: handleAction,
      },
    };
    renderToast(toastWithAction);
    const actionBtn = screen.getByRole('button', { name: /enable desktop alerts/i });
    expect(actionBtn).toBeInTheDocument();
    fireEvent.click(actionBtn);
    expect(handleAction).toHaveBeenCalledTimes(1);
  });
});
