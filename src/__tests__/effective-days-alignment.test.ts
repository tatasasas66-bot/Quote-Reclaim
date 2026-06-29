/**
 * UI ↔ cron effective quiet-age alignment tests.
 *
 * Verifies that effectiveDaysSilent (used by the UI) produces the same
 * effective days as the cron RPC formula (migration 014).
 *
 * The cron RPC computes:
 *   case
 *     when q.quote_sent_at is not null then
 *       greatest(0, extract(day from now() - q.quote_sent_at)::int)
 *     else
 *       greatest(0, q.days_silent + extract(day from now() - q.created_at)::int)
 *   end
 *
 * The UI computes:
 *   effectiveDaysSilent({ days_silent, quote_sent_at, created_at })
 *
 * Both must agree.
 */
import { describe, expect, it } from "vitest";
import { effectiveDaysSilent } from "@/lib/recovery/effective-days";
import { getRecoveryWindow, getRecommendedMessage } from "@/lib/recovery/recovery-logic";

describe("UI ↔ cron effective quiet-age alignment", () => {
  it("Case A: quote_sent_at 52 days ago → 52 days → Closeout", () => {
    const sentAt = new Date(Date.now() - 52 * 24 * 60 * 60 * 1000).toISOString();
    const days = effectiveDaysSilent({
      days_silent: 0,
      quote_sent_at: sentAt,
      created_at: new Date().toISOString(),
    });
    expect(days).toBeGreaterThanOrEqual(51);
    expect(days).toBeLessThanOrEqual(52);
    expect(getRecoveryWindow(days)).toBe("closeout");
    const rec = getRecommendedMessage({ daysQuiet: days, trade: "roofing" });
    expect(rec.messageFamily).toBe("Clean Closeout");
  });

  it("Case B: no quote_sent_at, days_silent=20, created 3 days ago → 23 → Cold", () => {
    const createdAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const days = effectiveDaysSilent({
      days_silent: 20,
      quote_sent_at: null,
      created_at: createdAt,
    });
    expect(days).toBeGreaterThanOrEqual(22);
    expect(days).toBeLessThanOrEqual(23);
    expect(getRecoveryWindow(days)).toBe("cold");
    const rec = getRecommendedMessage({ daysQuiet: days, trade: "roofing" });
    expect(rec.messageFamily).toBe("Open, Revise, or Close");
  });

  it("Case C: no quote_sent_at, days_silent=3, created 10 days ago → 13 → Cooling", () => {
    const createdAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const days = effectiveDaysSilent({
      days_silent: 3,
      quote_sent_at: null,
      created_at: createdAt,
    });
    expect(days).toBeGreaterThanOrEqual(12);
    expect(days).toBeLessThanOrEqual(13);
    expect(getRecoveryWindow(days)).toBe("cooling");
    const rec = getRecommendedMessage({ daysQuiet: days, trade: "roofing" });
    expect(rec.messageFamily).toBe("Soft Decision Check");
  });

  it("Case D: entered today, days_silent=52, no quote_sent_at → 52 → Closeout", () => {
    const today = new Date().toISOString();
    const days = effectiveDaysSilent({
      days_silent: 52,
      quote_sent_at: null,
      created_at: today,
    });
    expect(days).toBe(52);
    expect(getRecoveryWindow(days)).toBe("closeout");
    const rec = getRecommendedMessage({ daysQuiet: days, trade: "roofing" });
    expect(rec.messageFamily).toBe("Clean Closeout");
  });
});

describe("effectiveDaysSilent fallback logic matches cron RPC", () => {
  it("uses quote_sent_at when available (not created_at)", () => {
    const sentAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const createdAt = new Date().toISOString();
    const days = effectiveDaysSilent({
      days_silent: 5,
      quote_sent_at: sentAt,
      created_at: createdAt,
    });
    // Should use quote_sent_at (30 days), NOT days_silent + 0 = 5
    expect(days).toBeGreaterThanOrEqual(29);
    expect(days).toBeLessThanOrEqual(30);
  });

  it("adds elapsed since created_at when quote_sent_at is null", () => {
    const createdAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const days = effectiveDaysSilent({
      days_silent: 10,
      quote_sent_at: null,
      created_at: createdAt,
    });
    // Should be 10 + 5 = 15
    expect(days).toBeGreaterThanOrEqual(14);
    expect(days).toBeLessThanOrEqual(15);
  });

  it("falls back to stored days_silent when both quote_sent_at and created_at are null", () => {
    const days = effectiveDaysSilent({
      days_silent: 42,
      quote_sent_at: null,
      created_at: null,
    });
    expect(days).toBe(42);
  });

  it("falls back to stored days_silent when quote_sent_at is invalid", () => {
    const createdAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const days = effectiveDaysSilent({
      days_silent: 20,
      quote_sent_at: "not-a-date",
      created_at: createdAt,
    });
    // Should fall through to days_silent + elapsed = 20 + 3 = 23
    expect(days).toBeGreaterThanOrEqual(22);
    expect(days).toBeLessThanOrEqual(23);
  });

  it("never returns negative", () => {
    const futureSentAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const days = effectiveDaysSilent({
      days_silent: 0,
      quote_sent_at: futureSentAt,
      created_at: new Date().toISOString(),
    });
    expect(days).toBe(0);
  });
});
