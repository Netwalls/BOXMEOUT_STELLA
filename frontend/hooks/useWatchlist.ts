import { useEffect, useState, useCallback } from 'react';

// Issue #1527: Watchlist hook
export const useWatchlist = (network: string) => {
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const key = `watchlist_${network}`;
  
  // Load from storage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) setWatchlist(JSON.parse(saved));
    } catch (e) {}
  }, [key]);
  
  // Listen for storage events (cross-tab sync)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue) {
        try {
          setWatchlist(JSON.parse(e.newValue));
        } catch (e) {}
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key]);
  
  const toggle = useCallback((marketId: string) => {
    try {
      setWatchlist(prev => {
        const next = prev.includes(marketId) ? prev.filter(id => id !== marketId) : [...prev, marketId];
        localStorage.setItem(key, JSON.stringify(next));
        return next;
      });
    } catch (e) {}
  }, [key]);
  
  return { watchlist, toggle, isWatched: (id: string) => watchlist.includes(id) };
};
