import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "rgb(var(--qr-bg-canvas) / <alpha-value>)",
        surface: {
          1: "rgb(var(--qr-bg-surface-1) / <alpha-value>)",
          2: "rgb(var(--qr-bg-surface-2) / <alpha-value>)",
          3: "rgb(var(--qr-bg-surface-3) / <alpha-value>)",
        },
        line: {
          subtle: "rgb(var(--qr-border-subtle) / <alpha-value>)",
          strong: "rgb(var(--qr-border-strong) / <alpha-value>)",
        },
        ink: {
          strong: "rgb(var(--qr-text-strong) / <alpha-value>)",
          DEFAULT: "rgb(var(--qr-text-default) / <alpha-value>)",
          muted: "rgb(var(--qr-text-muted) / <alpha-value>)",
        },
        brand: {
          DEFAULT: "rgb(var(--qr-brand-primary) / <alpha-value>)",
          dark: "rgb(var(--qr-brand-dark) / <alpha-value>)",
        },
        money: "rgb(var(--qr-money-gold) / <alpha-value>)",
        success: "rgb(var(--qr-success) / <alpha-value>)",
        warning: "rgb(var(--qr-warning) / <alpha-value>)",
        danger: "rgb(var(--qr-danger) / <alpha-value>)",
        focus: "rgb(var(--qr-focus) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "-apple-system", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
