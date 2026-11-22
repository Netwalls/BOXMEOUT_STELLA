import { useCallback, useEffect, useState } from 'react';

// Issue #1525: Remove exhaustive-deps suppression
export const useMarket = (marketId: string) => {
  const [market, setMarket] = useState(null);
  
  // FIX: No suppression - dependencies properly listed
  useEffect(() => {
    if (!marketId) return;
    // Fetch market
    const fetchMarket = async () => {
      const data = await fetch(`/api/markets/${marketId}`).then(r => r.json());
      setMarket(data);
    };
    fetchMarket();
  }, [marketId]);
  
  return market;
};
