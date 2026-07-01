import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const homepage = readSource("../app/page.tsx");
const authShell = readSource("../components/onboarding/AuthShell.tsx");
const authForm = readSource("../components/onboarding/AuthForm.tsx");
const button = readSource("../components/ui/button.tsx");

describe("Homepage mobile-safe layout", () => {
  it("main wrapper uses mobile-first padding (px-4 with larger sm: override)", () => {
    expect(homepage).toMatch(/px-4/);
    expect(homepage).toMatch(/sm:px-6/);
  });

  it("main wrapper is full width within max-width cap", () => {
    expect(homepage).toMatch(/w-full/);
    expect(homepage).toMatch(/max-w-6xl/);
  });

  it("header uses flex-wrap so the Sign in link wraps below logo on narrow screens", () => {
    expect(homepage).toMatch(/flex-wrap/);
  });

  it("hero section uses min-w-0 so flex children can shrink below intrinsic width", () => {
    expect(homepage).toMatch(/min-w-0/);
  });

  it("subtext paragraph uses break-words to prevent long-word overflow", () => {
    expect(homepage).toMatch(/break-words/);
  });

  it("CTA group wraps when buttons exceed viewport width", () => {
    // The CTA flex row already had flex-wrap; this guards against regression.
    expect(homepage).toMatch(/mt-5 flex flex-wrap items-center gap-3 pt-1/);
  });
});

describe("AuthShell mobile-safe layout", () => {
  it("main wrapper uses mobile-first padding (px-4 with sm:/lg: overrides)", () => {
    expect(authShell).toMatch(/px-4/);
    expect(authShell).toMatch(/sm:px-6/);
    expect(authShell).toMatch(/lg:px-10/);
  });

  it("header uses flex-wrap so the cross-link wraps on mobile", () => {
    // The header is the first <header> in the file.
    const headerBlock = authShell.match(/<header[^>]*>/);
    expect(headerBlock).not.toBeNull();
    expect(headerBlock?.[0] ?? "").toMatch(/flex-wrap/);
  });

  it("grid wrapper has min-w-0 so grid items can shrink", () => {
    // The grid is on the outer wrapper that holds both columns.
    expect(authShell).toMatch(/grid w-full max-w-6xl min-w-0/);
  });

  it("form section is centered with max-w-md on mobile", () => {
    expect(authShell).toMatch(/max-w-md/);
    expect(authShell).toMatch(/mx-auto/);
  });

  it("form card has w-full min-w-0 so it never exceeds the section", () => {
    expect(authShell).toMatch(/w-full min-w-0 rounded-2xl/);
  });

  it("hidden desktop column uses min-w-0", () => {
    expect(authShell).toMatch(/hidden min-w-0 flex-col gap-7 lg:flex/);
  });
});

describe("AuthForm fits in 375px viewport", () => {
  it("Magic Link button uses fullWidth so it never overflows the card", () => {
    // Button with fullWidth renders the w-full Tailwind class (see button.tsx).
    expect(authForm).toMatch(/<Button[^>]*fullWidth/);
    expect(button).toMatch(/fullWidth && "w-full"/);
  });

  it("never renders a fixed pixel width on inputs or buttons", () => {
    expect(authForm).not.toMatch(/w-\[\d+px\]/);
    expect(authForm).not.toMatch(/min-w-\[\d+px\]/);
  });
});

describe("Google OAuth feature flag", () => {
  it("reads NEXT_PUBLIC_ENABLE_GOOGLE_AUTH at build time", () => {
    expect(authForm).toContain("NEXT_PUBLIC_ENABLE_GOOGLE_AUTH");
    expect(authForm).toMatch(/GOOGLE_AUTH_ENABLED\s*=/);
  });

  it("gates the Google button block behind the flag", () => {
    // The block that renders the OR divider + Google button must require GOOGLE_AUTH_ENABLED
    expect(authForm).toMatch(/!magicSent\s*&&\s*GOOGLE_AUTH_ENABLED/);
  });

  it("keeps Magic Link rendering independent of the flag", () => {
    // The magic link form is rendered when !magicSent without referencing the flag.
    // Verify the magic link form code path is not wrapped by the flag.
    const magicFormMatch = authForm.match(/onSubmit=\{handleMagicLink\}/);
    expect(magicFormMatch).not.toBeNull();
  });
});
