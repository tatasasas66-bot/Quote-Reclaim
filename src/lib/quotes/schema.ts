import { z } from "zod";
import { TRADES, US_STATE_CODES } from "@/lib/utils/normalize";

export { TRADES };
export type Trade = (typeof TRADES)[number];

const STATE_PATTERN = /^[A-Z]{2}$/;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : ""));

const optionalEmail = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v && v.length > 0 ? v.toLowerCase() : ""))
  .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
    message: "Enter a valid email address",
  });

const optionalPhone = z
  .string()
  .trim()
  .max(40)
  .optional()
  .transform((v) => (v && v.length > 0 ? v : ""));

const optionalState = z
  .string()
  .trim()
  .max(2)
  .optional()
  .transform((v) => (v ? v.toUpperCase() : ""))
  .refine((v) => v === "" || STATE_PATTERN.test(v), {
    message: "Use a 2-letter state code (e.g. CA)",
  })
  .refine((v) => v === "" || US_STATE_CODES.has(v), {
    message: "Pick a US state from the list",
  });

export const quoteInputSchema = z
  .object({
    client_name: z.string().trim().min(1, "Client name is required").max(120),
    trade: z.enum(TRADES, {
      errorMap: () => ({ message: "Choose a trade from the list" }),
    }),
    project_type: optionalText(80),
    estimate_amount: z
      .number({ invalid_type_error: "Enter a number" })
      .positive("Estimate must be greater than zero")
      .max(1_000_000, "Estimate is too large"),
    days_silent: z
      .number({ invalid_type_error: "Enter a number" })
      .int("Days must be a whole number")
      .min(0)
      .max(365, "More than a year is unlikely"),
    client_email: optionalEmail,
    client_phone: optionalPhone,
    city: optionalText(80),
    state: optionalState,
    job_description: optionalText(500),
  })
  .refine((v) => v.client_email !== "" || v.client_phone !== "", {
    message:
      "Add a phone or email so the recovery plan can reach the customer.",
    path: ["client_email"],
  });

export type QuoteInput = z.infer<typeof quoteInputSchema>;

export const quoteUpdateSchema = quoteInputSchema;
export type QuoteUpdate = z.infer<typeof quoteUpdateSchema>;
