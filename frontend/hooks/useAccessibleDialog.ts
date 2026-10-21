"use client";

import { useEffect, useRef, useCallback } from "react";

export interface UseAccessibleDialogOptions {
  isOpen: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  /** Whether an operation is mid-flight (e.g. pending transaction or submission) */
  isBusy?: boolean;
  /** Called when the user presses Escape while isBusy is true */
  onBlockedEscape?: () => void;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Hook providing full WAI-ARIA modal dialog accessibility:
 * - Saves trigger element on open and restores focus on close.
 * - Moves focus into dialog on open.
 * - Traps Tab navigation cycling within the dialog.
 * - Closes on Escape unless an operation is mid-flight (`isBusy`), triggering `onBlockedEscape`.
 */
export function useAccessibleDialog({
  isOpen,
  containerRef,
  onClose,
  isBusy = false,
  onBlockedEscape,
}: UseAccessibleDialogOptions): void {
  const triggerRef = useRef<HTMLElement | null>(null);

  // Save the currently focused element right before opening
  useEffect(() => {
    if (isOpen) {
      triggerRef.current = (document.activeElement as HTMLElement) || null;
    }
  }, [isOpen]);

  // Restore focus to trigger element on close / unmount
  useEffect(() => {
    return () => {
      if (triggerRef.current && typeof triggerRef.current.focus === "function") {
        triggerRef.current.focus();
      }
    };
  }, []);

  // When isOpen transitions from true -> false, return focus to trigger
  const wasOpenRef = useRef(isOpen);
  useEffect(() => {
    if (wasOpenRef.current && !isOpen) {
      if (triggerRef.current && typeof triggerRef.current.focus === "function") {
        triggerRef.current.focus();
      }
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  // Focus the first focusable element (or dialog container) on open
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const timer = setTimeout(() => {
      if (!containerRef.current) return;
      const firstFocusable = containerRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (firstFocusable) {
        firstFocusable.focus();
      } else {
        containerRef.current.focus();
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [isOpen, containerRef]);

  // Handle Tab trapping and Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen || !containerRef.current) return;

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (isBusy) {
          onBlockedEscape?.();
        } else {
          onClose();
        }
        return;
      }

      if (e.key === "Tab") {
        const focusable = Array.from(
          containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        );

        if (focusable.length === 0) {
          e.preventDefault();
          containerRef.current.focus();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !containerRef.current.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !containerRef.current.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [isOpen, containerRef, isBusy, onBlockedEscape, onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleKeyDown]);
}
