"use client";
import { useEffect } from "react";
import { CheckCircle, XCircle, AlertCircle, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import Link from "next/link";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  /** When set, the toast links to this in-app route. */
  href?: string;
  /** Optional interactive action (e.g. opt-in buttons). */
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface ToastProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

export function Toast({ toast, onDismiss }: ToastProps): JSX.Element {
  const getTypeStyles = () => {
    switch (toast.type) {
      case "success":
        return {
          borderColor: "border-green-500",
          background: "bg-green-900/20",
          icon: <CheckCircle className="h-5 w-5 text-green-500" />,
          textColor: "text-green-500",
        };
      case "error":
        return {
          borderColor: "border-red-500",
          background: "bg-red-900/20",
          icon: <XCircle className="h-5 w-5 text-red-500" />,
          textColor: "text-red-500",
        };
      case "info":
        return {
          borderColor: "border-blue-500",
          background: "bg-blue-900/20",
          icon: <AlertCircle className="h-5 w-5 text-blue-500" />,
          textColor: "text-blue-500",
        };
    }
  };

  const styles = getTypeStyles();

  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 5000);

    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={`relative flex items-start p-4 mb-3 w-full max-w-sm ${styles.background} ${styles.borderColor} border rounded-lg shadow-lg`}
    >
      <div className="flex-shrink-0 mt-0.5">{styles.icon}</div>
      <div className="ml-3 flex-1">
        {toast.title && (
          <h3 className={`text-sm font-semibold ${styles.textColor}`}>{toast.title}</h3>
        )}
        <p className="text-sm text-gray-200 mt-1">{toast.message}</p>
        <div className="flex items-center gap-2 mt-2">
          {toast.href && (
            <Link
              href={toast.href}
              className="text-xs font-semibold text-gray-100 underline underline-offset-2 hover:text-white"
            >
              View market
            </Link>
          )}
          {toast.action && (
            <button
              type="button"
              onClick={toast.action.onClick}
              className="text-xs font-semibold rounded bg-amber-500 px-2 py-0.5 text-black hover:bg-amber-400 transition-colors"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="ml-4 flex-shrink-0 text-gray-400 hover:text-gray-200 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  );
}
