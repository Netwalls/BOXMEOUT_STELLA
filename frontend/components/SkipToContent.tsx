"use client";

import React from "react";

export interface SkipToContentProps {
  targetId?: string;
}

export function SkipToContent({ targetId = "main" }: SkipToContentProps): JSX.Element {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const target = document.getElementById(targetId);
    if (target) {
      // If target doesn't have tabIndex, temporarily set it so it can receive focus
      if (!target.hasAttribute("tabIndex")) {
        target.setAttribute("tabIndex", "-1");
      }
      target.focus();
    }
  };

  return (
    <a
      href={`#${targetId}`}
      onClick={handleClick}
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-amber-500 focus:text-black focus:font-semibold focus:rounded-lg focus:shadow-xl focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-900 transition-transform"
    >
      Skip to content
    </a>
  );
}
