/**
 * @vitest-environment happy-dom
 */
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmClient } from "@/app/auth/confirm/confirm-client";

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  replace: vi.fn(),
}));

const routeState = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => routeState.searchParams,
  useRouter: () => ({ replace: mocks.replace, push: mocks.replace }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({
    auth: { verifyOtp: mocks.verifyOtp },
  }),
}));

beforeEach(() => {
  mocks.verifyOtp.mockResolvedValue({ error: null });
  routeState.searchParams = new URLSearchParams();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/auth/confirm landing gate", () => {
  it("renders the secure sign-in button when token_hash is present", () => {
    routeState.searchParams = new URLSearchParams(
      "token_hash=abc123&type=magiclink",
    );
    render(<ConfirmClient />);

    expect(
      screen.getByRole("button", { name: /confirm secure sign-in/i }),
    ).toBeTruthy();
    expect(screen.getByText(/no password required/i)).toBeTruthy();
  });

  it("verifies the token and routes to the dashboard on click", async () => {
    routeState.searchParams = new URLSearchParams(
      "token_hash=abc123&type=magiclink",
    );
    render(<ConfirmClient />);

    fireEvent.click(
      screen.getByRole("button", { name: /confirm secure sign-in/i }),
    );

    await vi.waitFor(() =>
      expect(mocks.verifyOtp).toHaveBeenCalledWith({
        token_hash: "abc123",
        type: "magiclink",
      }),
    );
    await vi.waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith("/dashboard"),
    );
  });

  it("shows a clean fallback notice when query params are missing", () => {
    routeState.searchParams = new URLSearchParams();
    render(<ConfirmClient />);

    expect(screen.getByText(/incomplete or invalid/i)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /confirm secure sign-in/i }),
    ).toBeNull();
  });

  it("redirects to sign-in with link_expired when verification fails", async () => {
    routeState.searchParams = new URLSearchParams(
      "token_hash=abc123&type=magiclink",
    );
    mocks.verifyOtp.mockResolvedValueOnce({
      error: { code: "otp_expired", message: "expired" },
    });
    render(<ConfirmClient />);

    fireEvent.click(
      screen.getByRole("button", { name: /confirm secure sign-in/i }),
    );

    await vi.waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/sign-in?error=link_expired",
      ),
    );
  });
});
