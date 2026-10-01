import type { Bucket } from "./types";

/** Expert rating words to a step on one scale: +3 solid Democratic … 0 toss-up … -3 solid Republican. */
export function expertScore(label: string): number | null {
  const t = label.replace(/\(flip\)/i, "").trim().toLowerCase();
  if (/toss/.test(t)) return 0;
  const sign = /\bd\b|dem/.test(t) ? 1 : /\br\b|rep/.test(t) ? -1 : 0;
  if (!sign) return null;
  const level = /solid|safe/.test(t) ? 3 : /likely/.test(t) ? 2 : /lean|tilt/.test(t) ? 1 : null;
  return level == null ? null : sign * level;
}
export const bucketScore = (b: Bucket): number | null => {
  if (b === "tossup") return 0;
  const m = /^([dr])-(safe|likely|lean)$/.exec(b);
  if (!m) return null;
  return (m[1] === "d" ? 1 : -1) * ({ safe: 3, likely: 2, lean: 1 } as const)[m[2] as "safe" | "likely" | "lean"];
};
export const scoreLabel = (s: number) => (s === 0 ? "Toss-up" : `${Math.abs(s) === 3 ? "Solid" : Math.abs(s) === 2 ? "Likely" : "Lean"} ${s > 0 ? "D" : "R"}`);
export const scoreBucket = (s: number): Bucket => (s === 0 ? "tossup" : (`${s > 0 ? "d" : "r"}-${Math.abs(s) === 3 ? "safe" : Math.abs(s) === 2 ? "likely" : "lean"}` as Bucket));
export const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
