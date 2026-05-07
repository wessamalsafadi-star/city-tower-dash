"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Search,
  Loader2,
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

  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [automationFilter, setAutomationFilter] =
    useState<AutomationFilter>("all");

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
      setLeads((curr) =>
        curr.map((l) => (l.leadID === leadID ? data.lead : l))
      );
    } catch {
      // silent
    }
  }

  useEffect(() => {
    loadLeads();
  }, []);

  const stageOptions = useMemo(() => {
    const set = new Set(leads.map((l) => l.stage).filter(Boolean));
    return ["all", ...Array.from(set).sort()];
  }, [leads]);

  const statusOptions = useMemo(() => {
    const set = new Set(leads.map((l) => l.status).filter(Boolean));
    return ["all", ...Array.from(set).sort()];
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return leads.filter((l) => {
      if (sourceFilter !== "all") {
        const src = (l.source ?? "").toLowerCase();
        if (sourceFilter === "whatsapp" && src !== "whatsapp") return false;
        if (sourceFilter === "email" && src !== "email") return false;
        if (sourceFilter === "other" && (src === "whatsapp" || src === "email"))
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
  }, [
    leads,
    searchQuery,
    sourceFilter,
    stageFilter,
    statusFilter,
    automationFilter,
  ]);

  const summary = useMemo(() => {
    const total = leads.length;
    const whatsapp = leads.filter(
      (l) => (l.source ?? "").toLowerCase() === "whatsapp"
    ).length;
    const email = leads.filter(
      (l) => (l.source ?? "").toLowerCase() === "email"
    ).length;
    const byLevel: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      6: 0,
    };
    for (const l of leads) {
      if (l.automationLevel) byLevel[l.automationLevel]++;
    }
    return { total, whatsapp, email, byLevel };
  }, [leads]);

  return (
    <main className="main">
      <header className="header">
        <div>
          <h1 className="title">
            Campaign — Bh-Leasing-City-Tower-DIFC-2026
          </h1>
          <p className="subtitle">
            {lastRefresh ? (
              <>
                Last refresh:{" "}
                <strong>
                  {new Date(lastRefresh.finishedAt).toLocaleString()}
                </strong>{" "}
                · {lastRefresh.total} leads · {lastRefresh.enriched} tagged ·{" "}
                {lastRefresh.errored} errors ·{" "}
                {Math.round(lastRefresh.durationMs / 1000)}s
              </>
            ) : (
              "No refresh yet"
            )}
          </p>
        </div>
        <button
          onClick={refreshAll}
          disabled={refreshing}
          className="btn-primary"
        >
          {refreshing ? (
            <Loader2 className="spin" />
          ) : (
            <RefreshCw />
          )}
          Refresh all
        </button>
      </header>

      {error && (
        <div className="error-banner">
          <AlertCircle />
          <span>{error}</span>
        </div>
      )}

      <section className="summary">
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

      <section className="filters">
        <div className="search-wrap">
          <Search className="search-icon" />
          <input
            type="text"
            placeholder="Search name, phone, or lead ID…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
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
          options={statusOptions.map((o) => [
            o,
            o === "all" ? "All statuses" : o,
          ])}
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

        <span className="filter-count">
          {filteredLeads.length} of {leads.length}
        </span>
      </section>

      <section className="table-wrap">
        {loading ? (
          <div className="table-loading">
            <Loader2 className="spin" />
            Loading…
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="table-empty">
            {leads.length === 0
              ? 'No data yet. Click "Refresh all" to populate the cache.'
              : "No leads match the current filters."}
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Lead ID</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Source</th>
                  <th>Stage</th>
                  <th>Status</th>
                  <th>Automation</th>
                  <th>Created</th>
                  <th>Synced</th>
                  <th className="right"></th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map((lead) => (
                  <LeadRow
                    key={lead.leadID}
                    lead={lead}
                    onRefresh={refreshOne}
                  />
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
  return (
    <div className={`card card-${accent}`}>
      <div className="card-label">{label}</div>
      <div className="card-value">{value}</div>
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
      className="filter-select"
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

  async function handleRefresh() {
    setRefreshing(true);
    await onRefresh(lead.leadID);
    setRefreshing(false);
  }

  return (
    <tr>
      <td className="mono">{lead.leadID}</td>
      <td>{lead.customerDetails?.fullName ?? "—"}</td>
      <td className="mono">{lead.customerDetails?.phoneNumber ?? "—"}</td>
      <td>
        <SourceBadge source={lead.source} />
      </td>
      <td>
        <span className="badge badge-stage">{lead.stage}</span>
      </td>
      <td>
        <span
          className={`badge ${
            lead.status === "Open"
              ? "badge-status-open"
              : "badge-status-closed"
          }`}
        >
          {lead.status}
        </span>
      </td>
      <td>
        <AutomationBadge lead={lead} />
      </td>
      <td className="muted">
        {new Date(lead.createdAt).toLocaleDateString()}
      </td>
      <td className="muted">
        {lead.fetchedAt ? new Date(lead.fetchedAt).toLocaleTimeString() : "—"}
      </td>
      <td className="right">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="icon-btn"
          title="Refresh this lead"
        >
          {refreshing ? <Loader2 className="spin" /> : <RefreshCw />}
        </button>
      </td>
    </tr>
  );
}

function SourceBadge({ source }: { source: string | null }) {
  const s = (source ?? "").toLowerCase();
  if (s === "whatsapp") {
    return <span className="badge badge-source-whatsapp">WhatsApp</span>;
  }
  if (s === "email") {
    return <span className="badge badge-source-email">Email</span>;
  }
  return <span className="badge badge-source-other">{source ?? "—"}</span>;
}

function AutomationBadge({ lead }: { lead: EnrichedLead }) {
  if (lead.automationTag) {
    return (
      <span className="badge badge-automation">
        <CheckCircle2 />
        {lead.automationTag}
      </span>
    );
  }
  if (lead.enrichmentError) {
    return (
      <span className="badge badge-error" title={lead.enrichmentError}>
        <AlertCircle />
        {lead.enrichmentError.length > 24
          ? lead.enrichmentError.slice(0, 24) + "…"
          : lead.enrichmentError}
      </span>
    );
  }
  return <span className="dash">—</span>;
}
