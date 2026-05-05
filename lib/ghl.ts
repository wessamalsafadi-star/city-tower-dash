import { phoneVariants } from "./normalize";

const GHL_BASE_URL = process.env.GHL_BASE_URL!;
const GHL_PIT = process.env.GHL_PIT!;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID!;
const GHL_VERSION = "2023-02-21";

interface GHLContact {
  id: string;
  firstName?: string;
  lastName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  tags?: string[];
}

interface GHLSearchResponse {
  contacts: GHLContact[];
  total: number;
}

const headers = () => ({
  Authorization: `Bearer ${GHL_PIT}`,
  Version: GHL_VERSION,
  "Content-Type": "application/json",
  Accept: "application/json",
});

/**
 * Search GHL for a contact by phone. POST /contacts/search supports
 * filter combinations; we use a phone equality filter and try multiple
 * normalizations of the same number.
 *
 * Returns the first matching contact, or null.
 */
export async function findContactByPhone(
  rawPhone: string | null | undefined
): Promise<GHLContact | null> {
  const variants = phoneVariants(rawPhone);
  if (variants.length === 0) return null;

  for (const variant of variants) {
    const body = {
      locationId: GHL_LOCATION_ID,
      pageLimit: 5,
      filters: [
        {
          field: "phone",
          operator: "eq",
          value: variant,
        },
      ],
    };

    const res = await fetch(`${GHL_BASE_URL}/contacts/search`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!res.ok) {
      // GHL occasionally returns 422 for malformed phone strings. Skip
      // that variant rather than aborting the whole lookup.
      if (res.status === 422) continue;
      const errBody = await res.text().catch(() => "");
      throw new Error(
        `GHL search failed (${variant}): ${res.status} — ${errBody.slice(0, 200)}`
      );
    }

    const data: GHLSearchResponse = await res.json();
    if (data.contacts && data.contacts.length > 0) {
      return data.contacts[0];
    }
  }

  return null;
}

/**
 * High-level helper: given a phone, return the tag names assigned to
 * that contact in GHL. Returns null if no contact found.
 *
 * GHL inlines tags in the search response, so this is a single call.
 */
export async function getTagNamesForPhone(
  rawPhone: string | null | undefined
): Promise<string[] | null> {
  const contact = await findContactByPhone(rawPhone);
  if (!contact) return null;
  return contact.tags ?? [];
}
