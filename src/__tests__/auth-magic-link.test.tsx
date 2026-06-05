/**
 * @vitest-environment happy-dom
 */
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "@/components/onboarding/AuthForm";

const mocks = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  signInWithOAuth: vi.fn(),
  // The new first-attempt OAuth recovery hook reads the local session on
  // mount; the default is "no session" so the existing flow assertions hold.
  getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
}));

const routeState = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => routeState.searchParams,
}));

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({
    auth: {
      signInWithOtp: mocks.signInWithOtp,
      signInWithOAuth: mocks.signInWithOAuth,
      getSession: mocks.getSession,
    },
  }),
}));

async function submitEmail(email = "jane@example.com") {
  fireEvent.change(screen.getByLabelText(/work email/i), {
    target: { value: email },
  });
  fireEvent.click(screen.getByRole("button", { name: /send secure link/i }));
  await screen.findByText(
    "Secure link sent. Open it from your inbox to sign in.",
  );
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.signInWithOtp.mockResolvedValue({ error: null });
  routeState.searchParams = new URLSearchParams();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("AuthForm Magic Link flow", () => {
  it("sends a Magic Link and shows simple success copy", async () => {
    render(<AuthForm mode="sign-in" />);

    await submitEmail();

    expect(
      screen.getByText("Secure link sent. Open it from your inbox to sign in."),
    ).toBeTruthy();
    expect(
      screen.getByText("This link expires shortly and can only be used once."),
    ).toBeTruthy();
    expect(mocks.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "jane@example.com",
        options: expect.objectContaining({ shouldCreateUser: true }),
      }),
    );
  });

  it("does not show OTP fallback UI after sending the link", async () => {
    render(<AuthForm mode="sign-in" />);

    await submitEmail();

    expect(screen.queryByLabelText(/6-digit code/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /verify code/i })).toBeNull();
    expect(screen.queryByText(/Link not working/i)).toBeNull();
  });

  it("shows safe rate-limit copy", async () => {
    mocks.signInWithOtp.mockResolvedValueOnce({
      error: {
        code: "over_email_send_rate_limit",
        message: "Too many requests",
        status: 429,
      },
    });
    render(<AuthForm mode="sign-in" />);

    fireEvent.change(screen.getByLabelText(/work email/i), {
      target: { value: "jane@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send secure link/i }));

    await screen.findByText(
      "Too many attempts. Wait a few minutes, then try again.",
    );
    expect(
      (screen.getByRole("button", {
        name: /try again in/i,
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("shows expired-link callback copy after the session-check gate resolves", async () => {
    routeState.searchParams = new URLSearchParams("error=link_expired");

    render(<AuthForm mode="sign-in" />);

    // The error is gated behind the mount-time getSession() resolution so a
    // stale `?error=` never flashes during the brief microtask between mount
    // and the first resolution. findByText awaits the post-resolution render.
    expect(
      await screen.findByText(
        "That link expired or was already used. Send a fresh sign-in link.",
      ),
    ).toBeTruthy();
  });
});
