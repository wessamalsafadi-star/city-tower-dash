import { Redis } from "@upstash/redis";
import type { EnrichedLead, RefreshSummary } from "@/types/lead";

// Upstash Redis is what Vercel now recommends in place of the deprecated
// @vercel/kv package. The KV_REST_API_URL / KV_REST_API_TOKEN env vars that
// Vercel KV used to populate also work with Upstash, so this is drop-in
// whether you connect via the legacy KV path or the new Marketplace flow.
const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const LEAD_PREFIX = "lead:";
const LEAD_INDEX_KEY = "campaign:leadIndex"; // Set of all leadIDs we've cached
const LAST_REFRESH_KEY = "campaign:lastRefresh";

/**
 * Write an enriched lead to cache. Also updates the index set so we can
 * enumerate all known leads without scanning keys.
 */
export async function putLead(lead: EnrichedLead): Promise<void> {
  await Promise.all([
    redis.set(`${LEAD_PREFIX}${lead.leadID}`, lead),
    redis.sadd(LEAD_INDEX_KEY, lead.leadID),
  ]);
}

/** Bulk-write a batch of leads. Used by the cron refresh. */
export async function putLeadsBulk(leads: EnrichedLead[]): Promise<void> {
  if (leads.length === 0) return;

  // Parallel sets — fine for our volumes (low thousands).
  await Promise.all(leads.map((l) => redis.set(`${LEAD_PREFIX}${l.leadID}`, l)));

  // Update the index in one call. sadd's signature is (key, member, ...members).
  await redis.sadd(
    LEAD_INDEX_KEY,
    leads[0].leadID,
    ...leads.slice(1).map((l) => l.leadID)
  );
}

export async function getLead(leadID: string): Promise<EnrichedLead | null> {
  const data = await redis.get<EnrichedLead>(`${LEAD_PREFIX}${leadID}`);
  return data ?? null;
}

/**
 * Read every cached lead. We pull the index set, then mget the lead
 * payloads. Falls back to an empty array on a cold cache.
 */
export async function getAllLeads(): Promise<EnrichedLead[]> {
  const ids = await redis.smembers(LEAD_INDEX_KEY);
  if (!ids || ids.length === 0) return [];

  const keys = ids.map((id) => `${LEAD_PREFIX}${id}`);
  const records = await redis.mget<EnrichedLead[]>(...keys);
  return records.filter((r): r is EnrichedLead => r !== null);
}

export async function setLastRefresh(summary: RefreshSummary): Promise<void> {
  await redis.set(LAST_REFRESH_KEY, summary);
}

export async function getLastRefresh(): Promise<RefreshSummary | null> {
  return (await redis.get<RefreshSummary>(LAST_REFRESH_KEY)) ?? null;
}
