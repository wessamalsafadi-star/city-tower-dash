import { createClient, type RedisClientType } from "redis";
import type { EnrichedLead, RefreshSummary } from "@/types/lead";

// Vercel Managed Redis (and most managed providers) expose a single
// REDIS_URL connection string in the form `rediss://default:<token>@host:port`.
// node-redis is the standard client for this and what Vercel's quickstart
// recommends.
//
// Serverless caveat: each cold start opens a new TCP connection. We keep a
// module-level singleton so warm invocations reuse the connection and we
// avoid handshake on every request.

let client: RedisClientType | null = null;
let connecting: Promise<RedisClientType> | null = null;

async function getClient(): Promise<RedisClientType> {
  if (client && client.isOpen) return client;
  if (connecting) return connecting;

  connecting = (async () => {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error("REDIS_URL is not set");
    }

    const c: RedisClientType = createClient({
      url,
      // Bound the work each request can spend connecting. Without this, a
      // single bad invocation can sit waiting for the socket and burn the
      // entire function timeout.
      socket: {
        connectTimeout: 5_000,
        // Don't auto-reconnect inside a serverless invocation. If the socket
        // dies mid-request, fail fast so the client can recreate it next call.
        reconnectStrategy: false,
      },
    });

    c.on("error", (err) => {
      console.error("[redis] client error:", err);
    });

    await c.connect();
    client = c;
    return c;
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

const LEAD_PREFIX = "lead:";
const LEAD_INDEX_KEY = "campaign:leadIndex"; // Set of all leadIDs we've cached
const LAST_REFRESH_KEY = "campaign:lastRefresh";

// Values are stored JSON-encoded since node-redis only handles strings.
function encode(value: unknown): string {
  return JSON.stringify(value);
}

function decode<T>(raw: string | null): T | null {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Write an enriched lead to cache. Also updates the index set so we can
 * enumerate all known leads without scanning keys.
 */
export async function putLead(lead: EnrichedLead): Promise<void> {
  const r = await getClient();
  await Promise.all([
    r.set(`${LEAD_PREFIX}${lead.leadID}`, encode(lead)),
    r.sAdd(LEAD_INDEX_KEY, lead.leadID),
  ]);
}

/**
 * Bulk-write a batch of leads. We pipeline the writes via MULTI so the round
 * trips collapse into a single network exchange — important on serverless
 * where each round trip is expensive.
 */
export async function putLeadsBulk(leads: EnrichedLead[]): Promise<void> {
  if (leads.length === 0) return;
  const r = await getClient();

  const pipeline = r.multi();
  for (const lead of leads) {
    pipeline.set(`${LEAD_PREFIX}${lead.leadID}`, encode(lead));
  }
  pipeline.sAdd(LEAD_INDEX_KEY, leads.map((l) => l.leadID));
  await pipeline.exec();
}

export async function getLead(leadID: string): Promise<EnrichedLead | null> {
  const r = await getClient();
  const raw = await r.get(`${LEAD_PREFIX}${leadID}`);
  return decode<EnrichedLead>(raw);
}

/**
 * Read every cached lead. Pull the index set, then mGet the lead payloads
 * in one round trip. Falls back to an empty array on a cold cache.
 */
export async function getAllLeads(): Promise<EnrichedLead[]> {
  const r = await getClient();
  const ids = await r.sMembers(LEAD_INDEX_KEY);
  if (!ids || ids.length === 0) return [];

  const keys = ids.map((id) => `${LEAD_PREFIX}${id}`);
  const records = await r.mGet(keys);
  return records
    .map((raw) => decode<EnrichedLead>(raw))
    .filter((r): r is EnrichedLead => r !== null);
}

export async function setLastRefresh(summary: RefreshSummary): Promise<void> {
  const r = await getClient();
  await r.set(LAST_REFRESH_KEY, encode(summary));
}

export async function getLastRefresh(): Promise<RefreshSummary | null> {
  const r = await getClient();
  const raw = await r.get(LAST_REFRESH_KEY);
  return decode<RefreshSummary>(raw);
}
