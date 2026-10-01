import { ImageResponse } from "next/og";
import { getForecast, getRace, getRaces } from "@/lib/data";
import { flipOf } from "@/lib/flips";
import { BUCKET_LABEL, fmtDate, in100, surname } from "@/lib/format";

// Social-share card for each race, drawn at build time and served as /og/race/<race id>.png (no image files are committed).
export const dynamic = "force-static";
export const size = { width: 1200, height: 630 };

export function generateStaticParams() {
  return getRaces().map((r) => ({ file: `${r.id}.png` }));
}

const OFFICE = { senate: "U.S. Senate", house: "U.S. House", governor: "Governor" } as const;
const INK = "#1a1916", MUTED = "#5f5b53", LINE = "#e3e0d8", PAPER = "#faf9f6";
const color = (party: string | null) => (party === "D" ? "#1f4f94" : party === "R" ? "#a3302a" : "#6a4a9e");

function Side({ name, odds, party }: { name: string | null; odds: number; party: string | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, borderTop: `10px solid ${color(party)}`, paddingTop: 20 }}>
      <div style={{ display: "flex", fontSize: 40, color: INK }}>{surname(name) || "—"}</div>
      <div style={{ display: "flex", alignItems: "baseline", marginTop: 4 }}>
        <div style={{ display: "flex", fontSize: 150, fontWeight: 700, color: color(party), lineHeight: 1 }}>{in100(odds)}</div>
        <div style={{ display: "flex", fontSize: 36, color: MUTED, marginLeft: 14 }}>in 100</div>
      </div>
    </div>
  );
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const r = getRace((await params).file.replace(/\.png$/, ""));
  const f = getForecast();
  const v = f.default_version;
  const twoParty = r.kind === "two_party";
  const flip = flipOf(r, v);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: PAPER, padding: "56px 64px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 30, color: MUTED, letterSpacing: 1 }}>
            {OFFICE[r.office].toUpperCase()}{r.special ? " · SPECIAL ELECTION" : ""}{r.open ? " · OPEN SEAT" : ""}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 24, marginTop: 6 }}>
            <div style={{ display: "flex", fontSize: 76, fontWeight: 700, color: INK }}>{r.title}</div>
            {flip && <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: INK, background: "#f6c744", borderRadius: 999, padding: "6px 22px" }}>{flip.tier === "likely" ? "LIKELY FLIP" : "COULD FLIP"} · {flip.from} → {flip.to}</div>}
          </div>
        </div>
        {twoParty ? (
          <div style={{ display: "flex", gap: 56 }}>
            <Side name={r.dside.name} odds={r.p[v]} party={r.dside.party} />
            <Side name={r.rside.name} odds={1 - r.p[v]} party={r.rside.party} />
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: 40, color: MUTED }}>
            {r.kind === "uncontested" ? "Only one candidate on the ballot." : "Both finalists are from the same party."}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `2px solid ${LINE}`, paddingTop: 20, fontSize: 28, color: MUTED }}>
          <div style={{ display: "flex" }}>{twoParty ? `${BUCKET_LABEL[r.rating[v]]} · chance of winning, out of 100` : "Bellwether 2026 midterm forecast"}</div>
          <div style={{ display: "flex" }}>Bellwether · forecast of {fmtDate(f.asof)}</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
