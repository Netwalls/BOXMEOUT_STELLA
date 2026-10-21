import React, { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { RouteAnnouncer } from "./RouteAnnouncer";

expect.extend(toHaveNoViolations);

let mockPathname = "/";
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

describe("RouteAnnouncer component", () => {
  beforeEach(() => {
    mockPathname = "/";
  });

  it("remains silent on initial render and has no axe violations", async () => {
    const { container } = render(
      <div>
        <RouteAnnouncer />
        <main id="main">
          <h1>Initial Page</h1>
        </main>
      </div>
    );

    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toBeEmptyDOMElement();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("moves focus to h1 and announces navigation on route change", async () => {
    function AppMock() {
      const [route, setRoute] = useState("/home");
      mockPathname = route;

      return (
        <div>
          <button onClick={() => setRoute("/markets/123")}>Navigate to Market</button>
          <RouteAnnouncer targetMainId="main" />
          <main id="main">
            {route === "/home" ? (
              <h1>Boxing Prediction Markets</h1>
            ) : (
              <h1>Tyson Fury vs Oleksandr Usyk</h1>
            )}
          </main>
        </div>
      );
    }

    const user = userEvent.setup();
    render(<AppMock />);

    // Initially silent
    const liveRegion = screen.getByRole("status");
    expect(liveRegion).toBeEmptyDOMElement();

    // Trigger client navigation
    await user.click(screen.getByRole("button", { name: /navigate to market/i }));

    // Focus shifts to new h1 and announces
    await waitFor(() => {
      const h1 = screen.getByRole("heading", { level: 1 });
      expect(h1).toHaveFocus();
      expect(liveRegion).toHaveTextContent("Navigated to Tyson Fury vs Oleksandr Usyk");
    });
  });

  it("falls back to main container if page does not contain an h1", async () => {
    function AppMock() {
      const [route, setRoute] = useState("/home");
      mockPathname = route;

      return (
        <div>
          <button onClick={() => setRoute("/empty")}>Navigate Empty</button>
          <RouteAnnouncer targetMainId="main" />
          <main id="main">
            {route === "/home" ? <h1>Home</h1> : <p>No heading here</p>}
          </main>
        </div>
      );
    }

    const user = userEvent.setup();
    render(<AppMock />);

    await user.click(screen.getByRole("button", { name: /navigate empty/i }));

    await waitFor(() => {
      const main = document.getElementById("main");
      expect(main).toHaveFocus();
    });
  });
});
