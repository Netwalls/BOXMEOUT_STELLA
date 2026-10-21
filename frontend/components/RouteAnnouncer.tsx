"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export interface RouteAnnouncerProps {
  targetMainId?: string;
}

export function RouteAnnouncer({ targetMainId = "main" }: RouteAnnouncerProps): JSX.Element {
  const pathname = usePathname();
  const [announcement, setAnnouncement] = useState("");
  const isFirstMount = useRef(true);

  useEffect(() => {
    // Skip on initial SSR/hydration mount to avoid intrusive redundant announcements
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    const timer = setTimeout(() => {
      const main = document.getElementById(targetMainId);
      const heading = main?.querySelector<HTMLElement>("h1, [role='heading'][aria-level='1']");

      if (heading) {
        if (!heading.hasAttribute("tabIndex")) {
          heading.setAttribute("tabIndex", "-1");
        }
        heading.focus();
        const text = heading.textContent?.trim() || document.title || "new page";
        setAnnouncement(`Navigated to ${text}`);
      } else if (main) {
        if (!main.hasAttribute("tabIndex")) {
          main.setAttribute("tabIndex", "-1");
        }
        main.focus();
        setAnnouncement(`Navigated to ${document.title || "new page"}`);
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [pathname, targetMainId]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    >
      {announcement}
    </div>
  );
}
