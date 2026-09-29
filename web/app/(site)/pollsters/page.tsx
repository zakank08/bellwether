import type { Metadata } from "next";
import Link from "next/link";
import PollsterTable from "@/components/PollsterTable";
import { getPollsters } from "@/lib/data";

export const metadata: Metadata = { title: "Pollster ratings" };

export default function Pollsters() {
  const { ratings, active } = getPollsters();
  const rated = active.filter((a: any) => a.rated_as).length;
  return (
    <div className="wrap">
      <section className="block" style={{ paddingTop: 32 }}>
        <h1 className="display">Pollster ratings</h1>
        <p className="takeaway">
          How accurate each pollster has been in the final three weeks of Senate, House, governor and presidential races since 1998, compared with other pollsters in the <em>same</em> race.
          Negative “error vs. peers” means more accurate than the field. {rated} of the {active.length} pollsters with 2026 polls have a track record here; the rest get a slightly below-average weight until they build one.
        </p>
        <PollsterTable ratings={ratings} active={active.map((a: any) => a.rated_as).filter(Boolean)} />
        <h2 className="display" style={{ marginTop: 32 }}>How the grades work</h2>
        <div className="prose">
          <p>For every historical poll we take its error on the margin and subtract the average error of the other pollsters’ polls of the same race, which removes race difficulty. A pollster’s score is the average of those differences, shrunk toward zero as if it also had ten perfectly average polls; that keeps a few lucky results from topping the table. Firms with more disclosure (transparency score) and AAPOR Transparency Initiative or Roper Center membership get a small bonus.</p>
          <p>Grades run A+ to D. The weight column is the multiplier a pollster’s polls get in the averages (0.35× to 1.4×). “Lean” is the average signed miss when a Democrat was listed first, after at least five such polls. Data: FiveThirtyEight’s historical raw-polls file (CC BY 4.0, ABC News). Full details are in the <Link href="/methodology/">methodology</Link>.</p>
        </div>
      </section>
    </div>
  );
}
