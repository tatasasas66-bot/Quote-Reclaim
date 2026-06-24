/**
 * Shared types for the Full Auto Marketing engine.
 *
 * These are the closed sets the rest of the system (scoring, classification,
 * repo, API routes) operates on. Keep them here so the pure libs can import
 * without pulling Supabase.
 */

export type LeadStatus = "approved" | "review" | "rejected" | "suppressed";

export type CampaignStatus = "draft" | "active" | "paused" | "completed";

export type ReplyClassification =
  | "interested"
  | "asks_price"
  | "asks_how_it_works"
  | "wants_demo"
  | "lead_gen_confusion"
  | "existing_crm_objection"
  | "not_interested"
  | "unsubscribe"
  | "angry"
  | "wrong_person"
  | "out_of_office"
  | "bounced"
  | "low_confidence";

/** Classifications that MUST trigger immediate, permanent suppression. */
export const SUPPRESSING_CLASSIFICATIONS: ReadonlySet<ReplyClassification> = new Set<ReplyClassification>([
  "unsubscribe",
  "not_interested",
  "angry",
  "bounced",
]);

/** Classifications that warrant a safe draft reply (human-reviewed). */
export const DRAFTABLE_CLASSIFICATIONS: ReadonlySet<ReplyClassification> = new Set<ReplyClassification>([
  "interested",
  "asks_price",
  "asks_how_it_works",
  "wants_demo",
  "lead_gen_confusion",
  "existing_crm_objection",
  "wrong_person",
]);

export type LeadInput = {
  trade: string;
  email: string | null;
  website: string | null;
  reviewCount: number | null;
  reviewResponseRate: number | null;
  publicSignal: string | null;
  notes: string | null;
  city: string | null;
  niche: string | null;
};

export type ScoredLead = {
  score: number; // 0-100, capped
  status: LeadStatus;
  sendable: boolean;
  breakdown: {
    tradeFit: number;
    emailQuality: number;
    reviewCount: number;
    websiteQuality: number;
    quoteLanguage: number;
    seasonality: number;
    publicSignal: number;
    ownerOperator: number;
    ticketSize: number;
  };
};

export type ImportedLeadRow = {
  company: string;
  first_name?: string;
  email?: string;
  phone?: string;
  website?: string;
  city?: string;
  state?: string;
  trade: string;
  niche?: string;
  source?: string;
  gbp_url?: string;
  review_count?: string | number;
  review_response_rate?: string | number;
  public_signal?: string;
  last_gbp_post?: string;
  license_status?: string;
  notes?: string;
};
