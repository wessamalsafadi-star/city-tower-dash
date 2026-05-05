// Phone numbers in Engage are stored E.164-style: "+971544912017".
// AC stores phones inconsistently — could be "+971544912017", "971544912017",
// "0544912017", or with spaces. AC's `phone` filter is a prefix match, so we
// generate a small set of plausible candidates and let the caller try each.

/**
 * Generate phone variants to try when searching downstream platforms.
 * Returns most-specific first so callers can short-circuit on the first hit.
 */
export function phoneVariants(raw: string | null | undefined): string[] {
  if (!raw) return [];

  // Strip all non-digits (drops "+", spaces, dashes, parens).
  const digits = raw.replace(/\D/g, "");
  if (!digits) return [];

  const variants = new Set<string>();
  variants.add(`+${digits}`);   // +971544912017
  variants.add(digits);         // 971544912017

  // UAE-specific: if it starts with 971 and has 12 digits, also try the
  // domestic form starting with "0". Real-estate CRMs often store both.
  if (digits.startsWith("971") && digits.length === 12) {
    variants.add(`0${digits.slice(3)}`); // 0544912017
    variants.add(digits.slice(3));        // 544912017
  }

  // If the number looks like it's missing the leading "+", also try the
  // last 9 digits as a fallback (covers AC entries that stored locally).
  if (digits.length >= 9) {
    variants.add(digits.slice(-9));
  }

  return [...variants];
}

/**
 * Match an automation tag like "automation 1" through "automation 6".
 * Case-insensitive, tolerant of extra whitespace. Returns the level (1-6)
 * or null if no match.
 */
export function parseAutomationLevel(tagName: string): number | null {
  const m = tagName.trim().toLowerCase().match(/^automation\s+([1-6])$/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Given a list of tag names (in any casing), find the highest automation
 * level present. Leads can progress 1 → 6, so the highest is "where they
 * are now". Returns { tag: "automation 3", level: 3 } or null.
 */
export function pickHighestAutomation(
  tagNames: string[]
): { tag: string; level: number } | null {
  let best: { tag: string; level: number } | null = null;
  for (const name of tagNames) {
    const level = parseAutomationLevel(name);
    if (level !== null && (!best || level > best.level)) {
      best = { tag: `automation ${level}`, level };
    }
  }
  return best;
}
