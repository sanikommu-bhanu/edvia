// ==========================================================================
// School identity — crest colour and initials from the school's real name
// --------------------------------------------------------------------------
// Pure functions, deliberately separate from the component that renders
// them: they are the interesting logic (deterministic colour, filler-word
// stripping) and they are worth testing without mounting React.
//
// Everything derives from the Firestore `schools/{id}` record. Rename the
// school and the crest, initials and colour all follow — nothing is
// configured or hardcoded per deployment.
// ==========================================================================

export interface CrestColour {
  from: string;
  to: string;
}

/** Palette the deterministic picker chooses from. All pass contrast on white. */
export const CREST_PALETTE: CrestColour[] = [
  { from: "#6B3FBE", to: "#8257D3" }, // edvia indigo
  { from: "#1D6F5C", to: "#22A06B" }, // forest
  { from: "#1E4E8C", to: "#3B82F6" }, // navy
  { from: "#9A3412", to: "#EA7317" }, // terracotta
  { from: "#7A1F52", to: "#C2477F" }, // plum
  { from: "#155E75", to: "#0E9BB0" }, // teal
  { from: "#7C2D12", to: "#B45309" }, // amber-brown
  { from: "#4C1D95", to: "#7C3AED" }, // violet
];

/**
 * Stable hash, so a school's colour never changes between sessions or
 * devices. FNV-style multiply-and-mix over the name.
 */
export function crestFor(name: string): CrestColour {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return CREST_PALETTE[hash % CREST_PALETTE.length];
}

/**
 * Words that appear in almost every Indian school name and therefore carry
 * no identifying information. Stripped so "Greenfield International School"
 * reads as **GI** rather than **GS** — the distinguishing words first.
 */
const FILLER = new Set([
  "school", "public", "international", "academy", "the", "of", "and",
  "vidyalaya", "vidya", "college", "institute", "sr", "senior",
  "secondary", "high", "convent", "mission", "memorial",
]);

/**
 * Up to two initials, preferring the words that actually distinguish.
 *
 * Distinguishing words come FIRST, then the list is topped up from the
 * remaining words in original order. Filtering alone was too aggressive:
 * "Greenfield International School" has exactly one non-filler word, so it
 * produced a lonely "G". Topping up gives "GI" — still Greenfield-led, but
 * a crest rather than a single letter.
 */
export function schoolInitials(name: string): string {
  const words = name
    .split(/[\s-]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);

  const meaningful = words.filter((w) => !FILLER.has(w.toLowerCase()));
  const filler = words.filter((w) => FILLER.has(w.toLowerCase()));
  const ordered = [...meaningful, ...filler];

  return ordered
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
