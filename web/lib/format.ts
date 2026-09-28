import type { Bucket, Party } from "./types";

export const PARTY_NAME: Record<string, string> = { D: "Democrat", R: "Republican", I: "Independent", L: "Libertarian", G: "Green", O: "Other" };
export const PARTY_PLURAL: Record<string, string> = { D: "Democrats", R: "Republicans", I: "Independents" };
export const PARTY_SHORT: Record<string, string> = { D: "Dem.", R: "Rep.", I: "Ind.", L: "Lib.", G: "Grn.", O: "Oth." };

/** "X in 100" is the house style for odds. */
export const in100 = (p: number) => {
  const v = Math.round(p * 100);
  if (v >= 100 && p < 1) return ">99";
  if (v <= 0 && p > 0) return "<1";
  return String(v);
};

export const pct = (p: number) => `${in100(p)}%`;

export function marginLabel(m: number | null | undefined, dName?: string | null, rName?: string | null) {
  if (m == null) return "—";
  const lead = m >= 0 ? dName ?? "D" : rName ?? "R";
  return `${lead} +${Math.abs(m).toFixed(1)}`;
}

export function partyMarginLabel(m: number | null | undefined) {
  if (m == null) return "—";
  if (Math.abs(m) < 0.05) return "Even";
  return `${m > 0 ? "D" : "R"}+${Math.abs(m).toFixed(1)}`;
}

export const BUCKET_LABEL: Record<Bucket, string> = {
  "d-safe": "Solid D", "d-likely": "Likely D", "d-lean": "Lean D", tossup: "Toss-up", "r-lean": "Lean R",
  "r-likely": "Likely R", "r-safe": "Solid R", "i-safe": "Solid I", "i-likely": "Likely I", "i-lean": "Lean I",
};

export const bucketVar = (b: Bucket | "uncalled" | "notup") => {
  if (b === "uncalled") return "var(--uncalled)";
  if (b === "notup") return "var(--uncalled)";
  if (b.startsWith("i-")) return "var(--ind-fill)";
  return `var(--${b})`;
};

/** Label colour on a fill, per the design-system token notes. */
export const onBucket = (b: Bucket) =>
  b.endsWith("safe") || b.endsWith("likely") || b.startsWith("i-") ? "var(--on-strong)" : "var(--ink)";

export const partyInk = (p: Party | null | undefined) =>
  p === "D" ? "var(--dem)" : p === "R" ? "var(--rep)" : p === "I" ? "var(--ind)" : "var(--ink-muted)";

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) {
  const d = new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso);
  return d.toLocaleDateString("en-US", { timeZone: "America/New_York", ...opts });
}

export function fmtUpdated(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET";
}

export const leaderOf = (p: number, d: Party | null, r: Party | null): Party | null => (p >= 0.5 ? d : r);
