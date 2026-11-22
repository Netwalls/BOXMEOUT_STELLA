'use client';
import { useEffect, useState } from 'react';

// Issue #1526: Persist form draft
const STORAGE_KEY = 'createMarketDraft';

export const CreateMarketForm = () => {
  const [formData, setFormData] = useState({});
  const [showRestore, setShowRestore] = useState(false);
  
  // FIX: Load draft on mount
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        setShowRestore(true);
      }
    } catch (e) {
      // Private mode / quota errors - harmless
    }
  }, []);
  
  // FIX: Debounced save
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
      } catch (e) {
        // Ignore storage errors
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [formData]);
  
  const handleRestore = () => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setFormData(JSON.parse(saved));
    } catch (e) {}
  };
  
  const handleDiscard = () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    setShowRestore(false);
  };
  
  const handleSubmit = async () => {
    // Submit form...
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  };
  
  return <div>{showRestore && <><button onClick={handleRestore}>Restore</button><button onClick={handleDiscard}>Discard</button></>}</div>;
};
