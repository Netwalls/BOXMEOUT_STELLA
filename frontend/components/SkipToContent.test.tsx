import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { SkipToContent } from "./SkipToContent";

expect.extend(toHaveNoViolations);

describe("SkipToContent component", () => {
  it("renders with proper href, sr-only styling, and passes axe audits", async () => {
    const { container } = render(
      <div>
        <SkipToContent targetId="main" />
        <main id="main">
          <h1>Main Content</h1>
        </main>
      </div>
    );

    const link = screen.getByRole("link", { name: /skip to content/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "#main");
    expect(link).toHaveClass("sr-only");

    expect(await axe(container)).toHaveNoViolations();
  });

  it("shifts focus to target element on click", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <SkipToContent targetId="main" />
        <main id="main">
          <h1>Page Content</h1>
        </main>
      </div>
    );

    const link = screen.getByRole("link", { name: /skip to content/i });
    const main = document.getElementById("main");

    expect(main).not.toHaveFocus();

    await user.click(link);

    expect(main).toHaveFocus();
    expect(main).toHaveAttribute("tabindex", "-1");
  });
});
