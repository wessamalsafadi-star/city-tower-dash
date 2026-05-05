import { NextRequest, NextResponse } from "next/server";
import { fetchAllCampaignLeads } from "@/lib/engage";
import { enrichLeadsBulk } from "@/lib/enrich";
import { putLeadsBulk, setLastRefresh } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Vercel Cron hits this on a schedule (configured in vercel.json).
 *
 * Vercel sets `Authorization: Bearer ${CRON_SECRET}` on cron requests
 * when CRON_SECRET is set in env. We verify it before doing any work.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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

    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
