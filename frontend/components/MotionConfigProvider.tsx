"use client";

/**
 * MotionConfigProvider — wraps the app in framer-motion's MotionConfig with
 * reducedMotion="user" so all animations automatically respect the OS-level
 * prefers-reduced-motion media query without per-component opt-in.
 *
 * This is a separate "use client" component because MotionConfig is a React
 * context provider that must run in the client bundle, but app/layout.tsx is a
 * Server Component. Wrapping the client-side bits here keeps the layout clean.
 */
import { MotionConfig } from "framer-motion";

export function MotionConfigProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      {children}
    </MotionConfig>
  );
}
