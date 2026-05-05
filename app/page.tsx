"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Search,
  Loader2,
  ExternalLink,
} from "lucide-react";
import type { EnrichedLead, RefreshSummary } from "@/types/lead";

type SourceFilter = "all" | "whatsapp" | "email" | "other";
type AutomationFilter = "all" | "1" | "2" | "3" | "4" | "5" | "6" | "none";

interface ApiResponse {
  leads: EnrichedLead[];
  lastRefresh: RefreshSummary | null;
  count: number;
}

export default function Dashboard() {
  const [leads, setLeads] = useState<EnrichedLead[]>([]);
  const [lastRefresh, setLastRefresh] = useState<RefreshSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [automationFilter, setAutomationFilter] = useState<AutomationFilter>("all");

  async function loadLeads() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/leads", { cache: "no-store" });
      if (!res.ok) throw new Error(`Load failed: ${res.status}`);
      const data: ApiResponse = await res.json();
      setLeads(data.leads);
      setLastRefresh(data.lastRefresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function refreshAll() {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/leads/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Refresh failed: ${res.status}`);
      }
      await loadLeads();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }

  async function refreshOne(leadID: string) {
    try {
      const res = await fetch("/api/leads/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadID }),
      });
      if (!res.ok) return;
      const data = await res.json();
      // Patch the single lead in place rather than reloading the whole list.
      setLeads((curr) =>
        curr.map((l) => (l.leadID === leadID ? data.lead : l))
      );
    } catch {
      // Silently ignore — user can hit refresh again.
    }
  }

  useEffect(() => {
    loadLeads();
  }, []);

  // Distinct values for stage / status filters, derived from data.
  const stageOptions = useMemo(() => {
    const set = new Set(leads.map((l) => l.stage).filter(Boolean));
    return ["all", ...Array.from(set).sort()];
  }, [leads]);

  const statusOptions = useMemo(() => {
    const set = new Set(leads.map((l) => l.status).filter(Boolean));
    return ["all", ...Array.from(set).sort()];
  }, [leads]);

  // Apply all filters.
  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return leads.filter((l) => {
      if (sourceFilter !== "all") {
        const src = (l.source ?? "").toLowerCase();
        if (sourceFilter === "whatsapp" && src !== "whatsapp") return false;
        if (sourceFilter === "email" && src !== "email") return false;
        if (
          sourceFilter === "other" &&
          (src === "whatsapp" || src === "email")
        )
          return false;
      }

      if (stageFilter !== "all" && l.stage !== stageFilter) return false;
      if (statusFilter !== "all" && l.status !== statusFilter) return false;

      if (automationFilter !== "all") {
        if (automationFilter === "none") {
          if (l.automationLevel !== null) return false;
        } else if (l.automationLevel !== parseInt(automationFilter, 10)) {
          return false;
        }
      }

      if (q) {
        const haystack = [
          l.customerDetails?.fullName ?? "",
          l.customerDetails?.phoneNumber ?? "",
          l.leadID,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [leads, searchQuery, sourceFilter, stageFilter, statusFilter, automationFilter]);

  // Summary counts (always over the full set, not filtered).
  const summary = useMemo(() => {
    const total = leads.length;
    const whatsapp = leads.filter(
      (l) => (l.source ?? "").toLowerCase() === "whatsapp"
    ).length;
    const email = leads.filter(
      (l) => (l.source ?? "").toLowerCase() === "email"
    ).length;
    const byLevel: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    let untagged = 0;
    let errored = 0;
    for (const l of leads) {
      if (l.automationLevel) byLevel[l.automationLevel]++;
      else untagged++;
      if (l.enrichmentError) errored++;
    }
    return { total, whatsapp, email, byLevel, untagged, errored };
  }, [leads]);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Campaign — Bh-Leasing-City-Tower-DIFC-2026
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {lastRefresh ? (
              <>
                Last refresh:{" "}
                <span className="font-medium text-slate-700">
                  {new Date(lastRefresh.finishedAt).toLocaleString()}
                </span>{" "}
                · {lastRefresh.total} leads · {lastRefresh.enriched} tagged ·{" "}
                {lastRefresh.errored} errors · {Math.round(lastRefresh.durationMs / 1000)}s
              </>
            ) : (
              "No refresh yet"
            )}
          </p>
        </div>
        <button
          onClick={refreshAll}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {refreshing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Refresh all
        </button>
      </header>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary strip */}
      <section className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-2 mb-6">
        <SummaryCard label="Total" value={summary.total} accent="slate" />
        <SummaryCard label="WhatsApp" value={summary.whatsapp} accent="green" />
        <SummaryCard label="Email" value={summary.email} accent="blue" />
        {[1, 2, 3, 4, 5, 6].map((lvl) => (
          <SummaryCard
            key={lvl}
            label={`Auto ${lvl}`}
            value={summary.byLevel[lvl]}
            accent="violet"
          />
        ))}
      </section>

      {/* Filters */}
      <section className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search name, phone, or lead ID…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>

        <FilterSelect
          value={sourceFilter}
          onChange={(v) => setSourceFilter(v as SourceFilter)}
          options={[
            ["all", "All sources"],
            ["whatsapp", "WhatsApp"],
            ["email", "Email"],
            ["other", "Other"],
          ]}
        />

        <FilterSelect
          value={stageFilter}
          onChange={setStageFilter}
          options={stageOptions.map((o) => [o, o === "all" ? "All stages" : o])}
        />

        <FilterSelect
          value={statusFilter}
          onChange={setStatusFilter}
          options={statusOptions.map((o) => [o, o === "all" ? "All statuses" : o])}
        />

        <FilterSelect
          value={automationFilter}
          onChange={(v) => setAutomationFilter(v as AutomationFilter)}
          options={[
            ["all", "All automations"],
            ["1", "Automation 1"],
            ["2", "Automation 2"],
            ["3", "Automation 3"],
            ["4", "Automation 4"],
            ["5", "Automation 5"],
            ["6", "Automation 6"],
            ["none", "No tag"],
          ]}
        />

        <span className="text-sm text-slate-500 ml-auto">
          {filteredLeads.length} of {leads.length}
        </span>
      </section>

      {/* Table */}
      <section className="bg-white rounded-md border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading…
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            {leads.length === 0
              ? 'No data yet. Click "Refresh all" to populate the cache.'
              : "No leads match the current filters."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Lead ID</th>
                  <th className="text-left font-medium px-4 py-2">Name</th>
                  <th className="text-left font-medium px-4 py-2">Phone</th>
                  <th className="text-left font-medium px-4 py-2">Source</th>
                  <th className="text-left font-medium px-4 py-2">Stage</th>
                  <th className="text-left font-medium px-4 py-2">Status</th>
                  <th className="text-left font-medium px-4 py-2">Automation</th>
                  <th className="text-left font-medium px-4 py-2">Created</th>
                  <th className="text-left font-medium px-4 py-2">Synced</th>
                  <th className="text-right font-medium px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLeads.map((lead) => (
                  <LeadRow key={lead.leadID} lead={lead} onRefresh={refreshOne} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "slate" | "green" | "blue" | "violet";
}) {
  const accents = {
    slate: "bg-slate-50 border-slate-200 text-slate-700",
    green: "bg-emerald-50 border-emerald-200 text-emerald-800",
    blue: "bg-sky-50 border-sky-200 text-sky-800",
    violet: "bg-violet-50 border-violet-200 text-violet-800",
  };
  return (
    <div className={`rounded-md border px-3 py-2 ${accents[accent]}`}>
      <div className="text-xs font-medium opacity-80">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 text-sm rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}

function LeadRow({
  lead,
  onRefresh,
}: {
  lead: EnrichedLead;
  onRefresh: (leadID: string) => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const source = (lead.source ?? "").toLowerCase();

  async function handleRefresh() {
    setRefreshing(true);
    await onRefresh(lead.leadID);
    setRefreshing(false);
  }

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3 font-mono text-xs text-slate-600">{lead.leadID}</td>
      <td className="px-4 py-3">{lead.customerDetails?.fullName ?? "—"}</td>
      <td className="px-4 py-3 font-mono text-xs">
        {lead.customerDetails?.phoneNumber ?? "—"}
      </td>
      <td className="px-4 py-3">
        <SourceBadge source={lead.source} />
      </td>
      <td className="px-4 py-3">
        <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700">
          {lead.stage}
        </span>
      </td>
      <td className="px-4 py-3">
        <span
          className={`text-xs px-2 py-0.5 rounded ${
            lead.status === "Open"
              ? "bg-amber-100 text-amber-800"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {lead.status}
        </span>
      </td>
      <td className="px-4 py-3">
        <AutomationBadge lead={lead} />
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">
        {new Date(lead.createdAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">
        {lead.fetchedAt ? new Date(lead.fetchedAt).toLocaleTimeString() : "—"}
      </td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-50"
          title="Refresh this lead"
        >
          {refreshing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
        </button>
      </td>
    </tr>
  );
}

function SourceBadge({ source }: { source: string | null }) {
  const s = (source ?? "").toLowerCase();
  if (s === "whatsapp") {
    return (
      <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
        WhatsApp
      </span>
    );
  }
  if (s === "email") {
    return (
      <span className="text-xs px-2 py-0.5 rounded bg-sky-100 text-sky-800 font-medium">
        Email
      </span>
    );
  }
  return (
    <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-500">
      {source ?? "—"}
    </span>
  );
}

function AutomationBadge({ lead }: { lead: EnrichedLead }) {
  if (lead.automationTag) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-violet-100 text-violet-800 font-medium">
        <CheckCircle2 className="w-3 h-3" />
        {lead.automationTag}
      </span>
    );
  }
  if (lead.enrichmentError) {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-rose-50 text-rose-700"
        title={lead.enrichmentError}
      >
        <AlertCircle className="w-3 h-3" />
        {lead.enrichmentError.length > 24
          ? lead.enrichmentError.slice(0, 24) + "…"
          : lead.enrichmentError}
      </span>
    );
  }
  return <span className="text-xs text-slate-400">—</span>;
}
