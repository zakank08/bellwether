import { BUCKET_LABEL, bucketVar, in100, PARTY_NAME } from "@/lib/format";
import type { Bucket } from "@/lib/types";

export function Legend({ showInd = false }: { showInd?: boolean }) {
  const steps: Bucket[] = ["d-safe", "d-likely", "d-lean", "tossup", "r-lean", "r-likely", "r-safe"];
  return (
    <div aria-label="Map legend" style={{ maxWidth: 560 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
        {steps.map((b) => <div key={b} style={{ height: 12, background: bucketVar(b), borderRadius: 2 }} />)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, fontSize: 12, lineHeight: "16px", color: "var(--ink-muted)", textAlign: "center", marginTop: 4 }}>
        {steps.map((b) => <span key={b}>{BUCKET_LABEL[b]}</span>)}
      </div>
      <div className="small muted" style={{ marginTop: 6 }}>
        Solid ≥95 in 100 · Likely 75–95 · Lean 60–75 · Toss-up under 60 for either side
        {showInd && <> · <span style={{ display: "inline-block", width: 10, height: 10, background: "var(--ind-fill)", borderRadius: 2 }} /> Independent favored</>}
      </div>
    </div>
  );
}

export function tipLinesFor(dName: string | null, dParty: string | null, rName: string | null, rParty: string | null, p: number) {
  return (
    <>
      <span style={{ color: "var(--dem)" }}>{dName ?? "—"}{dParty && dParty !== "D" ? ` (${PARTY_NAME[dParty]})` : ""}</span>: <strong className="num">{in100(p)} in 100</strong><br />
      {rName && <><span style={{ color: rParty === "R" ? "var(--rep)" : "var(--ind)" }}>{rName}</span>: <strong className="num">{in100(1 - p)} in 100</strong></>}
    </>
  );
}
