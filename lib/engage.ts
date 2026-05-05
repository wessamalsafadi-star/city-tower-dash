import type { EngageLead, EngageListResponse } from "@/types/lead";

const ENGAGE_BASE_URL = process.env.ENGAGE_BASE_URL!;
const ENGAGE_BEARER_TOKEN = process.env.ENGAGE_BEARER_TOKEN!;
const ENGAGE_ASSET_ID = process.env.ENGAGE_ASSET_ID!;
const ENGAGE_CAMPAIGN_NAME = process.env.ENGAGE_CAMPAIGN_NAME!;

// Build the filter object that mirrors the curl example. We construct
// programmatically so we can swap campaign / asset without URL surgery.
function buildFilter() {
  return {
    query: {
      $and: [
        { asset: ENGAGE_ASSET_ID },
        { campaignName: { $in: [ENGAGE_CAMPAIGN_NAME] } },
      ],
      // Exclude child leads (only top-level lead records).
      $or: [
        { parentId: { $exists: false } },
        { parentId: { $eq: null } },
      ],
    },
    projection: {
      _id: 1,
      leadID: 1,
      agent: 1,
      customer: 1,
      stage: 1,
      status: 1,
      source: 1,
      campaignName: 1,
      contactType: 1,
      leadType: 1,
      createdAt: 1,
      updatedAt: 1,
      lastActivityAt: 1,
      closureTime: 1,
      qualificationTime: 1,
      acceptedAt: 1,
      isContacted: 1,
      isAccepted: 1,
      customerDetails: 1,
    },
  };
}

interface FetchPageOptions {
  page?: number;
  limit?: number;
}

async function fetchPage({
  page = 1,
  limit = 100,
}: FetchPageOptions): Promise<EngageListResponse> {
  const filter = encodeURIComponent(JSON.stringify(buildFilter()));
  const url = `${ENGAGE_BASE_URL}/properties/leads?filter=${filter}&page=${page}&limit=${limit}`;

  const res = await fetch(url, {
    headers: {
      accept: "*/*",
      Authorization: `Bearer ${ENGAGE_BEARER_TOKEN}`,
    },
    // Always fetch fresh from Engage — caching happens at our layer.
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Engage list failed: ${res.status} ${res.statusText} — ${body.slice(0, 200)}`
    );
  }

  return res.json();
}

/**
 * Pull every lead under the configured campaign by walking pages.
 * Stops when the API reports no next page.
 */
export async function fetchAllCampaignLeads(): Promise<EngageLead[]> {
  const all: EngageLead[] = [];
  let page = 1;

  while (true) {
    const resp = await fetchPage({ page, limit: 100 });
    all.push(...resp.data);

    if (!resp.meta.hasNextPage || resp.meta.next === null) break;
    page = resp.meta.next;

    // Hard safety stop. Adjust if campaigns ever exceed this.
    if (page > 50) {
      console.warn("[engage] aborting pagination at page 50 safeguard");
      break;
    }
  }

  return all;
}
