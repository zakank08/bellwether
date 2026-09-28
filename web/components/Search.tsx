"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

type Item = { id: string; t: string; o: string; c: string };
const OFFICE: Record<string, string> = { senate: "Senate", house: "House", governor: "Governor" };
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function Search({ index }: { index: Item[] }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => {
    const s = norm(q.trim());
    if (s.length < 2) return [];
    const words = s.split(/\s+/);
    return index
      .filter((i) => { const hay = norm(`${i.t} ${i.c} ${OFFICE[i.o]} ${i.id}`); return words.every((w) => hay.includes(w)); })
      .sort((a, b) => ["senate", "governor", "house"].indexOf(a.o) - ["senate", "governor", "house"].indexOf(b.o))
      .slice(0, 12);
  }, [q, index]);
  return (
    <div className="search" role="search">
      <label className="sr-only" htmlFor="race-search">Find a race, candidate or state</label>
      <input
        id="race-search" ref={ref} value={q} placeholder="Find a race or candidate" autoComplete="off"
        role="combobox" aria-expanded={hits.length > 0} aria-controls="race-search-list"
        onChange={(e) => { setQ(e.target.value); setSel(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
          if (e.key === "Enter" && hits[sel]) { router.push(`/race/${hits[sel].id}/`); setQ(""); }
          if (e.key === "Escape") setQ("");
        }}
      />
      {hits.length > 0 && (
        <ul className="search-results" id="race-search-list" role="listbox">
          {hits.map((h, i) => (
            <li key={h.id} role="option" aria-selected={i === sel}>
              <Link href={`/race/${h.id}/`} aria-selected={i === sel} onClick={() => setQ("")}>
                <span><strong>{h.t}</strong><br /><span className="muted">{h.c}</span></span>
                <span className="muted">{OFFICE[h.o]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && hits.length === 0 && (
        <ul className="search-results"><li className="muted small" style={{ padding: 12 }}>No race matches “{q}”. Try a state, district (e.g. “PA 7”) or last name.</li></ul>
      )}
    </div>
  );
}
