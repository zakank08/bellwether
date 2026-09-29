"use client";
import { AnimatePresence, motion } from "framer-motion";
import { useId, useMemo, useState } from "react";
import { fmtDate } from "@/lib/format";
import LineChart, { type Dot, type Series } from "./LineChart";

type RangeKey = "1W" | "1M" | "3M" | "6M" | "YTD" | "1Y" | "All" | "Custom";
const DAYS: Partial<Record<RangeKey, number>> = { "1W": 7, "1M": 30, "3M": 91, "6M": 182, "1Y": 365 };
const ORDER: RangeKey[] = ["1W", "1M", "3M", "6M", "YTD", "1Y", "All", "Custom"];
const LABEL: Record<RangeKey, string> = { "1W": "1W", "1M": "1M", "3M": "3M", "6M": "6M", YTD: "YTD", "1Y": "1Y", All: "All", Custom: "Custom" };
const FULL: Record<RangeKey, string> = { "1W": "past week", "1M": "past month", "3M": "past 3 months", "6M": "past 6 months", YTD: "this year", "1Y": "past year", All: "all data", Custom: "custom dates" };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const shift = (s: string, days: number) => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - days); return iso(d); };
const spanDays = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 864e5;

export type AutoY = { symmetric?: boolean; includeZero?: boolean; minSpan?: number; pad?: number };

/** A line chart with stock-app style range buttons (1W … All) and a custom
 * date picker. Ranges longer than the data are disabled; the y-axis refits
 * to what's visible; the line redraws when the range changes. */
export default function TimeChart({ title, series, dots = [], yFormat, yDomain, autoY, zeroLine, height = 280,
  defaultRange = "3M", deltaFormat, deltaLabel }: {
  title: string; series: Series[]; dots?: Dot[]; yFormat: (n: number) => string;
  yDomain?: [number, number]; autoY?: AutoY; zeroLine?: { y: number }; height?: number; defaultRange?: RangeKey;
  deltaFormat?: (d: number) => { text: string; color: string } | null; deltaLabel?: string;
}) {
  const all = series[0]?.values ?? [];
  const dataStart = all[0]?.date ?? iso(new Date());
  const dataEnd = all[all.length - 1]?.date ?? iso(new Date());
  const span = spanDays(dataStart, dataEnd);
  // A range is offered when the data covers most (85%+) of it; the chart then shows what exists.
  const available = (k: RangeKey) => k === "All" || k === "Custom" || (k === "YTD" ? dataStart < `${dataEnd.slice(0, 4)}-01-15` : (DAYS[k] ?? 0) * 0.85 <= span + 1);
  const firstOk = (k: RangeKey) => (available(k) ? k : "All");
  const [range, setRange] = useState<RangeKey>(firstOk(defaultRange));
  const [custom, setCustom] = useState<[string, string]>([shift(dataEnd, 60) < dataStart ? dataStart : shift(dataEnd, 60), dataEnd]);
  const id = useId();

  const [from, to] = useMemo<[string, string]>(() => {
    if (range === "Custom") return [custom[0] < dataStart ? dataStart : custom[0], custom[1] > dataEnd ? dataEnd : custom[1]];
    if (range === "All") return [dataStart, dataEnd];
    if (range === "YTD") return [`${dataEnd.slice(0, 4)}-01-01`, dataEnd];
    const f = shift(dataEnd, DAYS[range]!);
    return [f < dataStart ? dataStart : f, dataEnd];
  }, [range, custom, dataStart, dataEnd]);

  const vis = useMemo(() => series.map((s) => ({ ...s, values: s.values.filter((v) => v.date >= from && v.date <= to) })), [series, from, to]);
  const visDots = useMemo(() => dots.filter((d) => d.date >= from && d.date <= to), [dots, from, to]);

  const dom = useMemo<[number, number]>(() => {
    if (yDomain) return yDomain;
    const ys: number[] = [];
    for (const s of vis) for (const v of s.values) ys.push(v.y, v.lo ?? v.y, v.hi ?? v.y);
    for (const d of visDots) ys.push(d.y);
    if (!ys.length) return [-10, 10];
    const o = autoY ?? {};
    let lo = Math.min(...ys), hi = Math.max(...ys);
    if (o.includeZero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    if (o.symmetric) { const m = Math.max(Math.abs(lo), Math.abs(hi)); lo = -m; hi = m; }
    const minSpan = o.minSpan ?? 6;
    if (hi - lo < minSpan) { const c = (hi + lo) / 2; lo = c - minSpan / 2; hi = c + minSpan / 2; }
    const pad = (o.pad ?? 0.08) * (hi - lo);
    return [lo - pad, hi + pad];
  }, [yDomain, autoY, vis, visDots]);

  const first = vis[0]?.values[0], last = vis[0]?.values[vis[0].values.length - 1];
  const delta = first && last && deltaFormat ? deltaFormat(last.y - first.y) : null;
  const tooShort = (vis[0]?.values.length ?? 0) < 2;

  return (
    <div className="timechart">
      <div className="timechart-bar">
        <div className="range-group" role="radiogroup" aria-label={`Time range for ${title}`}>
          {ORDER.map((k) => (
            <button key={k} role="radio" aria-checked={range === k} disabled={!available(k)} onClick={() => setRange(k)}
              title={available(k) ? `Show ${FULL[k]}` : `Not enough history yet for ${FULL[k]}`}>{LABEL[k]}</button>
          ))}
        </div>
        {delta && (
          <span className="small num" style={{ color: delta.color }} aria-live="polite">
            {delta.text} <span className="muted">{range === "All" ? `since ${fmtDate(from, { month: "short", day: "numeric", year: "numeric" })}` : range === "Custom" ? `from ${fmtDate(from)} to ${fmtDate(to)}` : range === "YTD" ? "this year" : `over the ${FULL[range]}`}</span>
          </span>
        )}
      </div>
      <AnimatePresence initial={false}>
        {range === "Custom" && (
          <motion.div className="custom-range" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <label htmlFor={`${id}-from`}>From</label>
            <input id={`${id}-from`} type="date" min={dataStart} max={custom[1]} value={custom[0]} onChange={(e) => e.target.value && setCustom([e.target.value, custom[1]])} />
            <label htmlFor={`${id}-to`}>to</label>
            <input id={`${id}-to`} type="date" min={custom[0]} max={dataEnd} value={custom[1]} onChange={(e) => e.target.value && setCustom([custom[0], e.target.value])} />
            <span className="small muted">Data from {fmtDate(dataStart, { month: "short", day: "numeric", year: "numeric" })}</span>
          </motion.div>
        )}
      </AnimatePresence>
      {tooShort ? (
        <p className="muted small" style={{ padding: "40px 0" }}>Not enough data in this range. Try a longer one.</p>
      ) : (
        <LineChart key={`${from}|${to}`} title={title} series={vis} dots={visDots} yDomain={dom} yFormat={yFormat} zeroLine={zeroLine} height={height} xDomain={[from, to]} />
      )}
    </div>
  );
}
