import type { EngageLead, EnrichedLead, EnrichmentSource } from "@/types/lead";
import { fetchTagDictionary, getTagNamesForPhone as acGetTags } from "./activecampaign";
import { getTagNamesForPhone as ghlGetTags } from "./ghl";
import { pickHighestAutomation } from "./normalize";

/**
 * Decide which platform to query for a given lead's automation tag.
 * Source values seen so far: "Whatsapp", "Email", "source", null.
 * Anything ambiguous returns null and the lead is left un-enriched.
 */
function routeFor(source: string | null): EnrichmentSource {
  if (!source) return null;
  const s = source.toLowerCase();
  if (s === "whatsapp") return "ghl";
  if (s === "email") return "ac";
  return null;
}

interface EnrichOptions {
  // Pass a pre-fetched AC tag dictionary so a bulk run only loads it once.
  acTagDict?: Record<string, string>;
}

/**
 * Enrich a single lead. Never throws — errors are captured into the
 * returned record so a bad lead doesn't break a bulk refresh.
 */
export async function enrichLead(
  lead: EngageLead,
  opts: EnrichOptions = {}
): Promise<EnrichedLead> {
  const route = routeFor(lead.source);
  const phone = lead.customerDetails?.phoneNumber ?? null;
  const fetchedAt = new Date().toISOString();

  const base: EnrichedLead = {
    ...lead,
    automationTag: null,
    automationLevel: null,
    enrichmentSource: route,
    enrichmentError: null,
    fetchedAt,
  };

  if (!route) {
    base.enrichmentError = `Unsupported source: ${lead.source ?? "null"}`;
    return base;
  }

  if (!phone) {
    base.enrichmentError = "No phone number on customerDetails";
    return base;
  }

  try {
    let tagNames: string[] | null = null;

    if (route === "ghl") {
      tagNames = await ghlGetTags(phone);
    } else {
      // AC route — needs the tag dictionary to resolve IDs to names.
      const dict = opts.acTagDict ?? (await fetchTagDictionary());
      tagNames = await acGetTags(phone, dict);
    }

    if (tagNames === null) {
      base.enrichmentError = "Contact not found in target platform";
      return base;
    }

    const match = pickHighestAutomation(tagNames);
    if (match) {
      base.automationTag = match.tag;
      base.automationLevel = match.level;
    }
    return base;
  } catch (e) {
    base.enrichmentError = e instanceof Error ? e.message : String(e);
    return base;
  }
}

/**
 * Run a bulk refresh: enrich every lead with bounded concurrency so we
 * don't overwhelm AC/GHL or hit rate limits. AC tag dictionary is loaded
 * once and shared across all AC-routed leads.
 */
export async function enrichLeadsBulk(
  leads: EngageLead[],
  concurrency = 5
): Promise<EnrichedLead[]> {
  // Preload AC tag dictionary if any lead needs it. Failure here is
  // non-fatal — individual AC enrichments will retry the load.
  let acTagDict: Record<string, string> | undefined;
  if (leads.some((l) => routeFor(l.source) === "ac")) {
    try {
      acTagDict = await fetchTagDictionary();
    } catch (e) {
      console.warn("[enrich] AC tag dictionary preload failed:", e);
    }
  }

  const results: EnrichedLead[] = new Array(leads.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= leads.length) return;
      results[i] = await enrichLead(leads[i], { acTagDict });
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}
