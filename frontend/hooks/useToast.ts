"use client";
import { useState, useCallback } from "react";
import { ToastType } from "@/components/Toast";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

export interface UseToastResult {
  toasts: ToastItem[];
  showToast: (message: string, type: ToastType) => void;
  dismissToast: (id: string) => void;
}

/**
 * Global toast notification manager.
 * showToast() adds a new notification; dismissToast() removes it by ID.
 * Each toast auto-schedules its own dismissal after 5 seconds.
 * Intended to be used with a React context provider at the app root.
 */
export function useToast(): UseToastResult {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = new Map<string, NodeJS.Timeout>();

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType) => {
      const id = Date.now().toString() + Math.random();
      setToasts((prev) => [...prev, { id, message, type }]);

      const timer = setTimeout(() => dismissToast(id), 5000);
      timersRef.set(id, timer);
    },
    [dismissToast]
  );

  return { toasts, showToast, dismissToast };
}
