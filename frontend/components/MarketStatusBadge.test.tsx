import React from "react";
import { render } from "@testing-library/react";
import { MarketStatusBadge } from "./MarketStatusBadge";
import { MarketStatus } from "@/lib/api";

const STATUSES: MarketStatus[] = ["Open", "Locked", "Resolved", "Disputed", "Cancelled"];

describe("MarketStatusBadge", () => {
  it.each(STATUSES)("renders %s with correct label and snapshot", (status) => {
    const { container } = render(<MarketStatusBadge status={status} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
