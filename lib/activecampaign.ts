import { phoneVariants } from "./normalize";

const AC_BASE_URL = process.env.AC_BASE_URL!;
const AC_API_TOKEN = process.env.AC_API_TOKEN!;

interface ACContactsResponse {
  contacts: Array<{
    id: string;
    email: string;
    phone: string;
    firstName: string;
    lastName: string;
    links: { contactTags: string };
  }>;
  meta: { total: string };
}

interface ACContactTagsResponse {
  contactTags: Array<{ id: string; tag: string; contact: string }>;
}

interface ACTagsResponse {
  tags: Array<{ id: string; tag: string; tagType: string }>;
  meta: { total: string };
}

const headers = () => ({
  "Api-Token": AC_API_TOKEN,
  Accept: "application/json",
});

/**
 * Find an AC contact by phone. Tries multiple phone formats since AC
 * stores them inconsistently. AC's `phone` filter is a prefix match,
 * so we filter results to require a closer match where possible.
 *
 * Returns the first matching contact, or null if none found.
 */
export async function findContactByPhone(
  rawPhone: string | null | undefined
): Promise<ACContactsResponse["contacts"][0] | null> {
  const variants = phoneVariants(rawPhone);
  if (variants.length === 0) return null;

  for (const variant of variants) {
    const url = `${AC_BASE_URL}/api/3/contacts?phone=${encodeURIComponent(variant)}&limit=5`;
    const res = await fetch(url, { headers: headers(), cache: "no-store" });

    if (!res.ok) {
      // 404 is unusual for list endpoints; treat as no result.
      if (res.status === 404) continue;
      const body = await res.text().catch(() => "");
      throw new Error(
        `AC contact search failed (${variant}): ${res.status} — ${body.slice(0, 200)}`
      );
    }

    const data: ACContactsResponse = await res.json();
    if (data.contacts && data.contacts.length > 0) {
      return data.contacts[0];
    }
  }

  return null;
}

/**
 * Fetch the contactTags join records for a contact. Returns the tag IDs
 * assigned to that contact. We then resolve IDs to names via the cached
 * dictionary so we don't burn one call per tag.
 */
export async function fetchContactTagIds(contactId: string): Promise<string[]> {
  const url = `${AC_BASE_URL}/api/3/contacts/${contactId}/contactTags`;
  const res = await fetch(url, { headers: headers(), cache: "no-store" });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `AC contactTags failed (${contactId}): ${res.status} — ${body.slice(0, 200)}`
    );
  }

  const data: ACContactTagsResponse = await res.json();
  // The "tag" field on contactTags is the tag's ID (confusingly named).
  return (data.contactTags ?? []).map((ct) => ct.tag);
}

/**
 * Pull every tag in the AC account so we can resolve IDs → names locally.
 * AC has a `/tags` endpoint that paginates with offset/limit. We grab
 * everything once and cache the dictionary at the call site.
 */
export async function fetchTagDictionary(): Promise<Record<string, string>> {
  const dict: Record<string, string> = {};
  let offset = 0;
  const limit = 100;

  while (true) {
    const url = `${AC_BASE_URL}/api/3/tags?limit=${limit}&offset=${offset}`;
    const res = await fetch(url, { headers: headers(), cache: "no-store" });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `AC tags list failed: ${res.status} — ${body.slice(0, 200)}`
      );
    }

    const data: ACTagsResponse = await res.json();
    for (const t of data.tags ?? []) {
      dict[t.id] = t.tag;
    }

    const total = parseInt(data.meta.total, 10);
    offset += limit;
    if (offset >= total || (data.tags ?? []).length === 0) break;

    // Safety stop — AC accounts rarely have >10k tags.
    if (offset > 10000) break;
  }

  return dict;
}

/**
 * High-level helper: given a phone number, return the list of tag names
 * assigned to that contact in AC. Returns null if no contact found.
 *
 * The tag dictionary is passed in so callers can cache it across many
 * lookups in a single refresh run.
 */
export async function getTagNamesForPhone(
  rawPhone: string | null | undefined,
  tagDict: Record<string, string>
): Promise<string[] | null> {
  const contact = await findContactByPhone(rawPhone);
  if (!contact) return null;

  const tagIds = await fetchContactTagIds(contact.id);
  return tagIds.map((id) => tagDict[id]).filter((name): name is string => !!name);
}
