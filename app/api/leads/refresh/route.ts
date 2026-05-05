import { NextRequest, NextResponse } from "next/server";
import { fetchAllCampaignLeads } from "@/lib/engage";
import { enrichLead, enrichLeadsBulk } from "@/lib/enrich";
import { getLead, putLead, putLeadsBulk, setLastRefresh } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — bulk refresh on a cold cache can take a while.

/**
 * Manual refresh.
 *
 * Body shapes:
 *   { leadID: "10302175" }   — refresh a single lead (uses cached Engage snapshot)
 *   { all: true }            — full refresh: re-fetch from Engage, re-enrich everything
 */
export async function POST(req: NextRequest) {
  let body: { leadID?: string; all?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine — treat as no-op.
  }

  try {
    if (body.leadID) {
      // Single-lead refresh. We re-enrich using the cached Engage snapshot.
      // To get a fresh snapshot for one lead we'd need an Engage by-ID
      // endpoint; for now this re-runs the AC/GHL lookup, which is the
      // part that actually changes between cron runs.
      const existing = await getLead(body.leadID);
      if (!existing) {
        return NextResponse.json(
          { error: `Lead ${body.leadID} not in cache` },
          { status: 404 }
        );
      }

      const enriched = await enrichLead(existing);
      await putLead(enriched);
      return NextResponse.json({ lead: enriched });
    }

    if (body.all) {
      const startedAt = Date.now();
      const leads = await fetchAllCampaignLeads();
      const enriched = await enrichLeadsBulk(leads, 5);
      await putLeadsBulk(enriched);

      const summary = {
        total: enriched.length,
        enriched: enriched.filter((l) => l.automationTag !== null).length,
        errored: enriched.filter((l) => l.enrichmentError !== null).length,
        skipped: enriched.filter(
          (l) => l.enrichmentSource === null && l.enrichmentError !== null
        ).length,
        durationMs: Date.now() - startedAt,
        finishedAt: new Date().toISOString(),
      };
      await setLastRefresh(summary);

      return NextResponse.json({ summary });
    }

    return NextResponse.json(
      { error: "Specify { leadID } or { all: true }" },
      { status: 400 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
