import { render, screen } from "@testing-library/react";
import AdminPage from "@/app/admin/page";
import { useWallet } from "@/hooks/useWallet";
import { fetchPendingResolutions, fetchOracles, ApiError } from "@/lib/api";

jest.mock("@/lib/config", () => ({ API_BASE_URL: "http://api.test" }));
jest.mock("@/lib/stellar", () => ({ truncateAddress: (a: string) => a }));
jest.mock("@/hooks/useWallet");
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  fetchPendingResolutions: jest.fn(),
  fetchOracles: jest.fn(),
}));

const ADMIN = "GADMINWALLET";

beforeEach(() => {
  jest.clearAllMocks();
  (useWallet as jest.Mock).mockReturnValue({
    address: ADMIN,
    isConnected: true,
    connect: jest.fn(),
  });
  (fetchOracles as jest.Mock).mockResolvedValue([]);
});

test("admin data renders only after the server accepts the request", async () => {
  (fetchPendingResolutions as jest.Mock).mockResolvedValue([]);

  render(<AdminPage />);

  expect(screen.getByText("Verifying admin access…")).toBeInTheDocument();
  expect(await screen.findByText("Admin Dashboard")).toBeInTheDocument();
  expect(screen.queryByText("Access Denied")).not.toBeInTheDocument();
});

test("a wallet the server rejects sees Access Denied and no admin sections", async () => {
  (fetchPendingResolutions as jest.Mock).mockRejectedValue(new ApiError(403, "Forbidden"));

  render(<AdminPage />);

  expect(await screen.findByText("Access Denied")).toBeInTheDocument();
  expect(screen.queryByText("Verifying admin access…")).not.toBeInTheDocument();
  expect(fetchOracles).not.toHaveBeenCalled();
});

test("a non-auth failure shows the error message instead of Access Denied", async () => {
  (fetchPendingResolutions as jest.Mock).mockRejectedValue(new ApiError(500, "Backend unavailable"));

  render(<AdminPage />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Backend unavailable");
  expect(screen.queryByText("Access Denied")).not.toBeInTheDocument();
});

test("disconnected wallets get the connect prompt and no admin request is made", () => {
  (useWallet as jest.Mock).mockReturnValue({ address: null, isConnected: false, connect: jest.fn() });

  render(<AdminPage />);

  expect(screen.getByText("Connect your admin wallet to continue.")).toBeInTheDocument();
  expect(fetchPendingResolutions).not.toHaveBeenCalled();
});
