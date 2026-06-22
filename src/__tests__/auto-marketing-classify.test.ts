/**
 * Reply classification + suppression tests — pure, no DB.
 *
 * The safety rail under test: suppression words ALWAYS win. An email
 * containing "stop" and "interested" still suppresses.
 */
import { describe, expect, it } from "vitest";
import {
  classifyReply,
  draftReplyFor,
  isSuppressing,
  isDraftable,
  suppressionReason,
} from "@/lib/auto-marketing/classify";

describe("classifyReply — suppression wins over everything", () => {
  it("'stop' → unsubscribe (suppressed)", () => {
    expect(classifyReply("please stop emailing me").classification).toBe("unsubscribe");
  });
  it("'unsubscribe' → unsubscribe", () => {
    expect(classifyReply("unsubscribe me now").classification).toBe("unsubscribe");
  });
  it("'remove me' → unsubscribe", () => {
    expect(classifyReply("remove me from this list").classification).toBe("unsubscribe");
  });
  it("'this is spam' → angry (suppressed)", () => {
    expect(classifyReply("this is spam, I'm reporting you").classification).toBe("angry");
  });
  it("'lawsuit' → angry", () => {
    expect(classifyReply("I'll file a lawsuit").classification).toBe("angry");
  });
  it("'not interested' → not_interested (suppressed)", () => {
    expect(classifyReply("not interested, thanks").classification).toBe("not_interested");
  });
  it("bare 'no' → not_interested (suppressed)", () => {
    expect(classifyReply("no").classification).toBe("not_interested");
  });

  // The critical safety test: suppression wins even if interested words appear.
  it("'stop' beats 'interested' — suppression wins", () => {
    const r = classifyReply("interested but please stop emailing");
    expect(r.classification).toBe("unsubscribe");
    expect(isSuppressing(r.classification)).toBe(true);
  });
  it("'not interested' beats 'price' — suppression wins", () => {
    const r = classifyReply("not interested in the price");
    expect(r.classification).toBe("not_interested");
    expect(isSuppressing(r.classification)).toBe(true);
  });
});

describe("classifyReply — draftable classifications", () => {
  it("'interested' → interested", () => {
    expect(classifyReply("sounds good, tell me more").classification).toBe("interested");
  });
  it("'how much' → asks_price", () => {
    expect(classifyReply("how much does it cost?").classification).toBe("asks_price");
  });
  it("'how does it work' → asks_how_it_works", () => {
    expect(classifyReply("how does it work exactly?").classification).toBe("asks_how_it_works");
  });
  it("'is this leads' → lead_gen_confusion", () => {
    expect(classifyReply("is this like Angi leads?").classification).toBe("lead_gen_confusion");
  });
  it("'I use Jobber' → existing_crm_objection", () => {
    expect(classifyReply("I already use Jobber for this").classification).toBe("existing_crm_objection");
  });
  it("'wrong person' → wrong_person", () => {
    expect(classifyReply("wrong person, I don't handle this").classification).toBe("wrong_person");
  });
});

describe("classifyReply — low confidence fallback", () => {
  it("gibberish → low_confidence", () => {
    const r = classifyReply("asdf jkl");
    expect(r.classification).toBe("low_confidence");
    expect(r.confidence).toBe(0.5);
  });
  it("empty → low_confidence", () => {
    expect(classifyReply("").classification).toBe("low_confidence");
  });
});

describe("classifyReply — confidence", () => {
  it("deterministic hits have confidence 1.0", () => {
    expect(classifyReply("stop").confidence).toBe(1.0);
    expect(classifyReply("interested").confidence).toBe(1.0);
    expect(classifyReply("how much?").confidence).toBe(1.0);
  });
});

describe("isSuppressing / isDraftable", () => {
  it("unsubscribe/not_interested/angry are suppressing", () => {
    expect(isSuppressing("unsubscribe")).toBe(true);
    expect(isSuppressing("not_interested")).toBe(true);
    expect(isSuppressing("angry")).toBe(true);
  });
  it("interested/asks_price/etc are NOT suppressing", () => {
    expect(isSuppressing("interested")).toBe(false);
    expect(isSuppressing("asks_price")).toBe(false);
    expect(isSuppressing("low_confidence")).toBe(false);
  });
  it("interested/asks_price/wrong_person are draftable", () => {
    expect(isDraftable("interested")).toBe(true);
    expect(isDraftable("asks_price")).toBe(true);
    expect(isDraftable("wrong_person")).toBe(true);
  });
  it("unsubscribe/angry/low_confidence are NOT draftable", () => {
    expect(isDraftable("unsubscribe")).toBe(false);
    expect(isDraftable("angry")).toBe(false);
    expect(isDraftable("low_confidence")).toBe(false);
  });
});

describe("draftReplyFor", () => {
  it("interested draft contains audit URL", () => {
    const draft = draftReplyFor("interested");
    expect(draft).toContain("quotereclaim.com/audit");
    expect(draft).toContain("60 seconds");
  });
  it("asks_price draft mentions $79/month", () => {
    const draft = draftReplyFor("asks_price");
    expect(draft).toContain("$79/month");
    expect(draft).toContain("free");
  });
  it("wrong_person draft includes company name", () => {
    const draft = draftReplyFor("wrong_person", "Sun Belt Concrete");
    expect(draft).toContain("Sun Belt Concrete");
  });
  it("suppressing classifications return null draft", () => {
    expect(draftReplyFor("unsubscribe")).toBeNull();
    expect(draftReplyFor("angry")).toBeNull();
    expect(draftReplyFor("not_interested")).toBeNull();
  });
  it("low_confidence returns null draft", () => {
    expect(draftReplyFor("low_confidence")).toBeNull();
  });
});

describe("suppressionReason", () => {
  it("returns reason for suppressing classifications", () => {
    expect(suppressionReason("unsubscribe")).toBe("reply_unsubscribe");
    expect(suppressionReason("angry")).toBe("reply_angry");
    expect(suppressionReason("not_interested")).toBe("reply_not_interested");
  });
  it("returns null for non-suppressing classifications", () => {
    expect(suppressionReason("interested")).toBeNull();
    expect(suppressionReason("low_confidence")).toBeNull();
  });
});
