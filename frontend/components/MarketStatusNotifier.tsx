'use client';
import { useEffect, useCallback } from 'react';

// Issue #1525: Remove exhaustive-deps suppression
export const MarketStatusNotifier = ({ marketId, onStatusChange, addToast }) => {
  // FIX: Stabilise addToast via callback or context
  const handleStatusChange = useCallback((status: string) => {
    if (addToast) {
      addToast(status);
    }
    if (onStatusChange) {
      onStatusChange(status);
    }
  }, [onStatusChange, addToast]);
  
  // FIX: No suppression - dependencies properly listed
  useEffect(() => {
    if (!marketId) return;
    const checkStatus = async () => {
      const status = await fetch(`/api/markets/${marketId}/status`).then(r => r.json());
      handleStatusChange(status.state);
    };
    checkStatus();
  }, [marketId, handleStatusChange]);
  
  return null;
};
