import React from "react";
import { render, screen } from "@testing-library/react";
import RootLayout from "./layout";

jest.mock("@/app/globals.css", () => ({}));

describe("RootLayout skip link and focus (F-107)", () => {
  it("renders a skip link as the first focusable element", () => {
    render(<RootLayout><p>Body</p></RootLayout>);

    const skipLink = screen.getByRole("link", { name: /skip to content/i });
    expect(skipLink).toHaveAttribute("href", "#main");
  });

  it("targets a main landmark with the id used by the skip link", () => {
    const { container } = render(<RootLayout><p>Body</p></RootLayout>);

    const main = container.querySelector("main");
    expect(main).not.toBeNull();
    expect(main).toHaveAttribute("id", "main");
  });

  it("keeps the skip link visible when focused", () => {
    render(<RootLayout><p>Body</p></RootLayout>);

    const skipLink = screen.getByRole("link", { name: /skip to content/i });
    expect(skipLink.className).toMatch(/sr-only/);
    expect(skipLink.className).toMatch(/focus:not-sr-only/);
  });

  it("does not clip focus outlines on main", () => {
    const { container } = render(<RootLayout><p>Body</p></RootLayout>);

    expect(container.querySelector("main")?.className).not.toMatch(/overflow-x-hidden/);
  });
});
