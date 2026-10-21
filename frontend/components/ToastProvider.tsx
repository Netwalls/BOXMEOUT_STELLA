'use client';

import { createContext, useContext, useState, ReactNode } from 'react';
import { Toast as ToastComponent, ToastType } from '@/components/Toast';

// Internal toast item stored in state
export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  title?: string;
  href?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export type ToastOptions = {
  title?: string;
  href?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
};

export interface ToastContextType {
  toasts: ToastItem[];
  addToast: (
    message: string,
    type: ToastType,
    optionsOrHref?: string | ToastOptions,
    extraHref?: string
  ) => void;
  removeToast: (id: string) => void;
}

export const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (
    message: string,
    type: ToastType,
    optionsOrHref?: string | ToastOptions,
    extraHref?: string
  ) => {
    const id = Math.random().toString(36).substr(2, 9);
    let title: string | undefined;
    let href: string | undefined;
    let action: { label: string; onClick: () => void } | undefined;

    if (typeof optionsOrHref === "string") {
      if (optionsOrHref.startsWith("/") || optionsOrHref.startsWith("http")) {
        href = optionsOrHref;
      } else {
        title = optionsOrHref;
      }
    } else if (optionsOrHref && typeof optionsOrHref === "object") {
      title = optionsOrHref.title;
      href = optionsOrHref.href;
      action = optionsOrHref.action;
    }

    if (extraHref) {
      href = extraHref;
    }

    setToasts((prev) => [...prev, { id, message, type, title, href, action }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div className="fixed bottom-4 right-4 space-y-2 z-50">
        {toasts.map(toast => (
          <ToastComponent
            key={toast.id}
            toast={toast}
            onDismiss={removeToast}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}

/**
 * Alias for useToast — exported as useToastProvider for backwards compatibility
 * with pages that import it under this name (e.g. app/create/page.tsx).
 */
export const useToastProvider = useToast;
