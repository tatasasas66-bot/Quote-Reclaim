/**
 * @vitest-environment happy-dom
 */
import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "@/components/onboarding/AuthForm";

const mocks = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signInWithOAuth: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    replace: mocks.replace,
    refresh: mocks.refresh,
  }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabaseClient: () => ({
    auth: {
      signInWithOtp: mocks.signInWithOtp,
      verifyOtp: mocks.verifyOtp,
      signInWithOAuth: mocks.signInWithOAuth,
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

async function openOtpFallback() {
  fireEvent.click(
    screen.getByRole("button", {
      name: "Link not working? Enter the 6-digit code from the email.",
    }),
  );
  await screen.findByLabelText(/6-digit code/i);
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.signInWithOtp.mockResolvedValue({ error: null });
  mocks.verifyOtp.mockResolvedValue({ error: null });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("AuthForm OTP fallback", () => {
  it("makes Magic Link success copy primary after email submit", async () => {
    render(<AuthForm mode="sign-in" />);

    await submitEmail();

    expect(
      screen.getByText("Secure link sent. Open it from your inbox to sign in."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "This link expires in 60 minutes and can only be used once.",
      ),
    ).toBeTruthy();
    expect(mocks.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "jane@example.com",
        options: expect.objectContaining({ shouldCreateUser: true }),
      }),
    );
  });

  it("keeps OTP as a secondary fallback instead of the main path", async () => {
    render(<AuthForm mode="sign-in" />);

    await submitEmail();

    expect(screen.queryByLabelText(/6-digit code/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /verify code/i })).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "Link not working? Enter the 6-digit code from the email.",
      }),
    ).toBeTruthy();

    await openOtpFallback();
    expect(screen.getByLabelText(/6-digit code/i)).toBeTruthy();
  });

  it("verifies the 6-digit code with Supabase type email", async () => {
    render(<AuthForm mode="sign-in" />);

    await submitEmail();
    await openOtpFallback();
    fireEvent.change(screen.getByLabelText(/6-digit code/i), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: /verify code/i }));

    await waitFor(() => {
      expect(mocks.verifyOtp).toHaveBeenCalledWith({
        email: "jane@example.com",
        token: "123456",
        type: "email",
      });
    });
    expect(mocks.replace).toHaveBeenCalledWith("/dashboard");
  });

  it("shows safe copy for expired or invalid OTP responses", async () => {
    mocks.verifyOtp.mockResolvedValueOnce({
      error: {
        code: "otp_expired",
        message: "Email link is invalid or has expired",
        status: 403,
      },
    });
    render(<AuthForm mode="sign-in" />);

    await submitEmail();
    await openOtpFallback();
    fireEvent.change(screen.getByLabelText(/6-digit code/i), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: /verify code/i }));

    await screen.findByText("That code or link expired. Send a fresh one.");
  });

  it("shows safe copy and cooldown UI for send rate limits", async () => {
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
      "Too many attempts. Wait a few minutes before sending another code.",
    );
    expect(
      (screen.getByRole("button", {
        name: /send secure link in/i,
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
