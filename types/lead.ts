// Subset of Engage lead fields we care about for the dashboard.
export interface EngageLead {
  _id: string;
  leadID: string;
  customer: string;
  agent: string | null;
  stage: string;
  status: string;
  source: string | null;
  campaignName: string;
  contactType: string;
  leadType: string;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string | null;
  closureTime: string | null;
  qualificationTime: string | null;
  acceptedAt: string | null;
  isContacted: boolean;
  isAccepted: boolean;
  customerDetails: {
    fullName: string;
    firstName: string;
    lastName: string | null;
    type: string;
    phoneNumber: string;
    doNotDisturb: boolean | null;
    dncrStatus: boolean;
  };
}

export interface EngageListResponse {
  status: boolean;
  message: string;
  data: EngageLead[];
  meta: {
    total: number;
    limit: number;
    totalPages: number;
    page: number;
    from: number;
    hasPrevPage: boolean;
    hasNextPage: boolean;
    prev: number | null;
    next: number | null;
  };
}

// Where the automation tag was found.
export type EnrichmentSource = "ghl" | "ac" | null;

// What we cache per lead. The Engage data is the snapshot, augmented with
// the enrichment outcome.
export interface EnrichedLead extends EngageLead {
  automationTag: string | null;       // e.g. "automation 3" — null = no match
  automationLevel: number | null;     // 1..6 — extracted from the tag for sort/filter
  enrichmentSource: EnrichmentSource; // which platform we resolved against
  enrichmentError: string | null;     // human-readable error if lookup failed
  fetchedAt: string;                  // ISO timestamp of last enrichment
}

export interface RefreshSummary {
  total: number;
  enriched: number;
  errored: number;
  skipped: number;
  durationMs: number;
  finishedAt: string;
}
