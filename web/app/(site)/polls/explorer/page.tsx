import type { Metadata } from "next";
import fs from "node:fs";
import path from "node:path";
import PollExplorer, { type PollRow } from "@/components/PollExplorer";
import { getRaces } from "@/lib/data";

export const metadata: Metadata = { title: "Poll explorer", description: "Every race poll in the forecast in one searchable table: pollster, dates, sample, results and how we adjusted each one." };

export default function Page() {
  const rows: PollRow[] = [];
  for (const r of getRaces()) {
    if (!r.n_polls) continue;
    const d = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "race", `${r.id}.json`), "utf8"));
    for (const p of d.polls ?? []) {
      rows.push({ id: r.id, race: r.title, office: r.office, state: r.state, pollster: p.pollster, grade: p.grade ?? null, start: p.start, end: p.end, n: p.n, pop: p.pop,
        answers: Object.entries(p.answers ?? {}).map(([k, v]) => `${k} ${v}`).join(" · "), adjusted: p.adjusted, url: p.url, internal: !!p.internal, sponsors: (p.sponsors ?? []).join(", ") });
    }
  }
  rows.sort((a, b) => b.end.localeCompare(a.end));
  return (
    <div className="wrap">
      <header className="masthead">
        <div className="kicker">Polls</div>
        <h1>Poll explorer</h1>
        <p className="dek">All {rows.length.toLocaleString("en-US")} race polls behind the forecast, newest first. Search by race, state, pollster or sponsor. “Adjusted” is the Democratic-side margin after we remove the pollster’s usual lean and put the poll on a likely-voter basis. Generic-ballot and approval polls are on the <a href="/polls/">polls page</a>.</p>
      </header>
      <PollExplorer rows={rows} />
    </div>
  );
}
