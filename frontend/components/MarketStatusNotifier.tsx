"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useMarkets } from "@/hooks/useMarkets";
import { useToast } from "@/components/ToastProvider";
import type { Market, MarketStatus } from "@/lib/api";

const NOTIFIED_KEY_PREFIX = "notified:";
const BROWSER_OPT_IN_KEY = "notifications:browser";

const MESSAGES: Partial<Record<MarketStatus, (m: Market) => string>> = {
  Resolved: (m) => `${m.fighterA.name} vs ${m.fighterB.name} has resolved. Claim your winnings.`,
  Cancelled: (m) => `${m.fighterA.name} vs ${m.fighterB.name} was cancelled. Claim your refund.`,
  Disputed: (m) => `${m.fighterA.name} vs ${m.fighterB.name} has been disputed.`,
};

/**
 * Returns true only the first time this browser sees a market reach a status. The key lives in
 * localStorage, which every tab on the origin shares, so a change is announced once per browser.
 */
function claimNotification(marketId: string, status: MarketStatus): boolean {
  const key = `${NOTIFIED_KEY_PREFIX}${marketId}:${status}`;
  try {
    if (window.localStorage.getItem(key)) return false;
    window.localStorage.setItem(key, "1");
    return true;
  } catch {
    // Storage is blocked, so this page view notifies once and cannot dedupe across tabs.
    return true;
  }
}

function browserNotificationsEnabled(): boolean {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  try {
    return window.localStorage.getItem(BROWSER_OPT_IN_KEY) === "on";
  } catch {
    return false;
  }
}

/**
 * Tells a user when a market they hold a position in resolves, is cancelled or is disputed.
 * Renders an in-app toast with a link to the market. A browser notification is sent only if
 * the user has opted in through the prompt below.
 */
export function MarketStatusNotifier(): JSX.Element | null {
  const { address } = useWallet();
  const { bets } = usePortfolio(address);
  const { markets } = useMarkets();
  const { addToast } = useToast();

  // Statuses seen on the previous check. Null until the first check, so opening the app does not
  // announce changes that happened while the user was away.
  const previous = useRef<Map<string, MarketStatus> | null>(null);
  const [canAskForBrowserPermission, setCanAskForBrowserPermission] = useState(false);

  const positionKey = [...new Set(bets.map((bet) => bet.marketId))].sort().join(",");

  useEffect(() => {
    setCanAskForBrowserPermission(
      typeof Notification !== "undefined" && Notification.permission === "default",
    );
  }, []);

  useEffect(() => {
    const positionIds = new Set(positionKey ? positionKey.split(",") : []);
    const held = markets.filter((market) => positionIds.has(market.id));
    const before = previous.current;

    previous.current = new Map(held.map((market) => [market.id, market.status]));
    if (before === null) return;

    for (const market of held) {
      const was = before.get(market.id);
      if (was === undefined || was === market.status) continue;

      const message = MESSAGES[market.status];
      if (!message || !claimNotification(market.id, market.status)) continue;

      const text = message(market);
      addToast(text, "info", `/markets/${market.id}`);
      if (browserNotificationsEnabled()) {
        new Notification("BOXMEOUT", { body: text, tag: `${market.id}:${market.status}` });
      }
    }
  }, [markets, positionKey]); // eslint-disable-line react-hooks/exhaustive-deps -- addToast is recreated each render and is safe to omit

  if (!address || bets.length === 0 || !canAskForBrowserPermission) return null;

  async function enableBrowserNotifications() {
    setCanAskForBrowserPermission(false);
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      try {
        window.localStorage.setItem(BROWSER_OPT_IN_KEY, "on");
      } catch {
        // Without storage the browser notifications stay off until the user opts in again.
      }
    }
  }

  return (
    <div className="fixed bottom-4 left-4 z-40 max-w-xs rounded-lg border border-gray-700 bg-gray-900 p-3 text-xs text-gray-300 shadow-lg">
      <p className="mb-2">Want a browser notification when your markets resolve?</p>
      <button
        type="button"
        onClick={enableBrowserNotifications}
        className="rounded-md bg-amber-500 px-3 py-1.5 font-semibold text-black hover:bg-amber-400"
      >
        Notify me in the browser
      </button>
    </div>
  );
}
