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
    "Check your inbox. Enter the 6-digit code or use the secure link.",
  );
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
  it("shows OTP input after email submit while keeping Magic Link available", async () => {
    render(<AuthForm mode="sign-in" />);

    await submitEmail();

    expect(screen.getByLabelText(/6-digit code/i)).toBeTruthy();
    expect(screen.getByText(/secure link expires in 60 minutes/i)).toBeTruthy();
    expect(mocks.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "jane@example.com",
        options: expect.objectContaining({ shouldCreateUser: true }),
      }),
    );
  });

  it("verifies the 6-digit code with Supabase type email", async () => {
    render(<AuthForm mode="sign-in" />);

    await submitEmail();
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
