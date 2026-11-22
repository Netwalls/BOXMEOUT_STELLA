import { useOnlineStatus } from '@/hooks/useOnlineStatus';

// Issue #1521: Show offline banner with status role
export const OfflineBanner = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 bg-yellow-100 border-b-2 border-yellow-400 p-3 text-center z-50"
    >
      📡 You are offline. Some features are disabled.
    </div>
  );
};
