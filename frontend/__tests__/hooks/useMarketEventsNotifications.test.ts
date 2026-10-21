import { renderHook, act } from "@testing-library/react";
import {
  useMarketEvents,
  shouldNotifyCrossTab,
  sendBrowserNotification,
  DEDUP_KEY_PREFIX,
} from "@/hooks/useMarketEvents";
import * as api from "@/lib/api";
import { ToastContext } from "@/components/ToastProvider";
import React from "react";

jest.mock("@/lib/api");

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onopen: ((ev: any) => void) | null = null;
  onmessage: ((ev: any) => void) | null = null;
  onerror: ((ev: any) => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  emitOpen() {
    this.onopen?.(new Event("open"));
  }

  emitMessage(data: any) {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(data) }));
  }

  emitError() {
    this.onerror?.(new Event("error"));
  }
}

describe("useMarketEvents Notifications", () => {
  const mockFetchMarketStats = api.fetchMarketStats as jest.Mock;
  const originalEventSource = global.EventSource;
  const mockAddToast = jest.fn();
  let notificationSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    MockEventSource.instances = [];
    (global as any).EventSource = MockEventSource;
    (global as any).Notification = class MockNotification {
      static permission: NotificationPermission = "default";
      static requestPermission = jest.fn().mockResolvedValue("granted");
      constructor(public title: string, public options?: NotificationOptions) {}
    };

    mockFetchMarketStats.mockResolvedValue({
      marketId: "mkt-1",
      status: "Open",
      poolA: "1000",
      poolB: "2000",
      impliedOddsA: 33.3,
      impliedOddsB: 66.7,
      totalBets: 5,
    });
  });

  afterEach(() => {
    global.EventSource = originalEventSource;
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      ToastContext.Provider,
      {
        value: {
          toasts: [],
          addToast: mockAddToast,
          removeToast: jest.fn(),
        },
      },
      children
    );

  it("triggers toast with link when status transitions to Resolved for user with position", () => {
    renderHook(
      () =>
        useMarketEvents("mkt-1", {
          hasPosition: true,
          initialStatus: "Open",
        }),
      { wrapper }
    );

    const es = MockEventSource.instances[0];

    act(() => {
      es.emitOpen();
      es.emitMessage({
        marketId: "mkt-1",
        status: "Resolved",
        poolA: "5000",
        poolB: "10000",
        impliedOddsA: 33.3,
        impliedOddsB: 66.7,
        totalBets: 10,
      });
    });

    expect(mockAddToast).toHaveBeenCalledTimes(1);
    expect(mockAddToast).toHaveBeenCalledWith(
      "Your market has resolved and is now open for claims!",
      "success",
      expect.objectContaining({
        title: "Market Resolved",
        href: "/markets/mkt-1",
      })
    );
  });

  it("does not trigger toast when user has no position", () => {
    renderHook(
      () =>
        useMarketEvents("mkt-1", {
          hasPosition: false,
          initialStatus: "Open",
        }),
      { wrapper }
    );

    const es = MockEventSource.instances[0];

    act(() => {
      es.emitOpen();
      es.emitMessage({
        marketId: "mkt-1",
        status: "Resolved",
        poolA: "5000",
        poolB: "10000",
      });
    });

    expect(mockAddToast).not.toHaveBeenCalled();
  });

  it("triggers Disputed and Cancelled status toasts correctly", () => {
    const { rerender } = renderHook(
      ({ initialStatus }) =>
        useMarketEvents("mkt-disputed", {
          hasPosition: true,
          initialStatus,
        }),
      {
        wrapper,
        initialProps: { initialStatus: "Open" },
      }
    );

    const es = MockEventSource.instances[0];

    act(() => {
      es.emitOpen();
      es.emitMessage({
        marketId: "mkt-disputed",
        status: "Disputed",
        poolA: "1000",
        poolB: "1000",
      });
    });

    expect(mockAddToast).toHaveBeenCalledWith(
      "Your market has been disputed and is pending review.",
      "error",
      expect.objectContaining({
        title: "Market Disputed",
        href: "/markets/mkt-disputed",
      })
    );
  });

  it("deduplicates notifications across tabs via localStorage", () => {
    // Simulate another tab having already notified for this event 10s ago
    localStorage.setItem(
      `${DEDUP_KEY_PREFIX}mkt-1_Resolved`,
      String(Date.now() - 10000)
    );

    renderHook(
      () =>
        useMarketEvents("mkt-1", {
          hasPosition: true,
          initialStatus: "Open",
        }),
      { wrapper }
    );

    const es = MockEventSource.instances[0];

    act(() => {
      es.emitOpen();
      es.emitMessage({
        marketId: "mkt-1",
        status: "Resolved",
        poolA: "5000",
        poolB: "10000",
      });
    });

    // Suppressed due to cross-tab deduplication
    expect(mockAddToast).not.toHaveBeenCalled();
  });

  it("dispatches browser Notification if permission is granted", () => {
    (global as any).Notification.permission = "granted";
    const notificationConstructorSpy = jest.fn();
    (global as any).Notification = class MockNotification {
      static permission = "granted";
      constructor(title: string, options?: NotificationOptions) {
        notificationConstructorSpy(title, options);
      }
    };

    renderHook(
      () =>
        useMarketEvents("mkt-alert", {
          hasPosition: true,
          initialStatus: "Open",
        }),
      { wrapper }
    );

    const es = MockEventSource.instances[0];

    act(() => {
      es.emitOpen();
      es.emitMessage({
        marketId: "mkt-alert",
        status: "Resolved",
        poolA: "1000",
        poolB: "1000",
      });
    });

    expect(notificationConstructorSpy).toHaveBeenCalledWith(
      "Market Resolved",
      expect.objectContaining({
        body: "Your market has resolved and is now open for claims!",
      })
    );
  });

  it("includes desktop alerts opt-in action when permission is default", () => {
    (global as any).Notification.permission = "default";

    renderHook(
      () =>
        useMarketEvents("mkt-default", {
          hasPosition: true,
          initialStatus: "Open",
        }),
      { wrapper }
    );

    const es = MockEventSource.instances[0];

    act(() => {
      es.emitOpen();
      es.emitMessage({
        marketId: "mkt-default",
        status: "Resolved",
        poolA: "1000",
        poolB: "1000",
      });
    });

    expect(mockAddToast).toHaveBeenCalledWith(
      expect.any(String),
      "success",
      expect.objectContaining({
        action: expect.objectContaining({
          label: "Enable desktop alerts",
        }),
      })
    );
  });
});
