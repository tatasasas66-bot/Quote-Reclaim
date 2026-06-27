/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import * as React from "react";
import { FullAutoMarketingClient } from "@/app/admin/full-auto-marketing/FullAutoMarketingClient";
import {
  normalizeSmartleadCampaignId,
  SMARTLEAD_CAMPAIGN_MAPPING_REQUIRED,
} from "@/lib/marketing/smartlead-campaign-id";
import type {
  MarketingCampaign,
  MarketingMetrics,
  MarketingSetupStatus,
} from "@/lib/marketing/types";

const campaign: MarketingCampaign = {
  id: "campaign-1",
  name: "Concrete Phoenix v1",
  slug: "concrete-phoenix-v1",
  trade: "concrete",
  city: "Phoenix",
  search_query: "concrete contractors Phoenix AZ",
  apify_actor_id: null,
  smartlead_campaign_id: null,
  daily_cap: 10,
  status: "draft",
  mode: "dry_run",
  sequence_config: { steps: [] },
  last_run_at: null,
  created_at: "2026-06-25T00:00:00.000Z",
  updated_at: "2026-06-25T00:00:00.000Z",
};

const setup: MarketingSetupStatus = {
  sender: "admin@example.com",
  items: [],
  liveReady: false,
  missingForLive: ["COMPLIANCE_POSTAL_ADDRESS"],
  dryRunAllowed: true,
  complianceAddressConfigured: false,
  liveBlockReason: "Live sending blocked: missing compliance postal address",
};

const metrics: MarketingMetrics = {
  leadsFound: 0,
  websitesFound: 0,
  emailsFound: 0,
  validEmails: 0,
  uploaded: 0,
  sent: 0,
  replied: 0,
  positive: 0,
  negative: 0,
  bounced: 0,
  unsubscribed: 0,
  skippedNoEmail: 0,
  skippedDuplicates: 0,
  skippedInvalid: 0,
  skippedRiskyUnknown: 0,
  skippedSuppressed: 0,
  latestError: null,
};

function renderAdmin(selectedCampaign: MarketingCampaign = campaign) {
  return render(
    <FullAutoMarketingClient
      setup={setup}
      campaigns={[selectedCampaign]}
      runs={[]}
      leads={[]}
      metrics={metrics}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Smartlead campaign ID validation", () => {
  it("accepts and trims campaign 3554090", () => {
    expect(normalizeSmartleadCampaignId(" 3554090 ")).toBe("3554090");
  });

  it("rejects blank, negative, and non-numeric IDs", () => {
    for (const value of ["", "-1", "campaign-3554090"]) {
      expect(() => normalizeSmartleadCampaignId(value)).toThrow(
        /positive whole number|required/i,
      );
    }
  });
});

describe("Full-Auto Marketing Smartlead mapping control", () => {
  it("shows and saves a mapping for the selected existing campaign", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, smartleadCampaignId: "3554090" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "setTimeout").mockImplementation(() => 0);
    renderAdmin();

    const input = screen.getByLabelText(
      /Smartlead campaign ID for selected campaign/i,
    ) as HTMLInputElement;
    expect(input.value).toBe("");

    fireEvent.change(input, { target: { value: "3554090" } });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /Save Smartlead mapping/i }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      action: "set_smartlead_campaign",
      campaignId: "campaign-1",
      smartleadCampaignId: "3554090",
    });
  });

  it("displays an existing Smartlead mapping in the editor and sequence reference", () => {
    renderAdmin({ ...campaign, smartlead_campaign_id: "3554090" });

    expect(
      (
        screen.getByLabelText(
          /Smartlead campaign ID for selected campaign/i,
        ) as HTMLInputElement
      ).value,
    ).toBe("3554090");
    expect(screen.getByText(/Smartlead campaign: 3554090/i)).toBeTruthy();
  });

  it("blocks upload before fetch when the selected campaign is not mapped", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderAdmin();

    fireEvent.click(
      screen.getByRole("button", { name: /Upload valid leads/i }),
    );

    expect(screen.getByRole("status").textContent).toBe(
      SMARTLEAD_CAMPAIGN_MAPPING_REQUIRED,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
