interface ErrorStateProps {
  message: string;
  onRetry: () => void;
  isRetrying?: boolean;
}

// Issue #1523: Shared error state with retry action
export const ErrorState = ({
  message,
  onRetry,
  isRetrying = false
}: ErrorStateProps) => {
  return (
    <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded">
      <p className="text-red-800 mb-3">{message}</p>
      <button
        onClick={onRetry}
        disabled={isRetrying}
        className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
      >
        {isRetrying ? 'Retrying...' : 'Retry'}
      </button>
    </div>
  );
};
