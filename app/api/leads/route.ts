import { NextResponse } from "next/server";
import { getAllLeads, getLastRefresh } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [leads, lastRefresh] = await Promise.all([
      getAllLeads(),
      getLastRefresh(),
    ]);

    return NextResponse.json({
      leads,
      lastRefresh,
      count: leads.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
