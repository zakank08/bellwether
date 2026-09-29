"use client";
import { useEffect, useState } from "react";

/** Sticky in-page navigation that highlights the section you're reading. */
export default function SectionNav({ items }: { items: [string, string][] }) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        let cur: string | null = null;
        for (const [id] of items) {
          const el = document.getElementById(id);
          if (el && el.getBoundingClientRect().top <= 140) cur = id;
        }
        setActive(cur);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, [items]);
  return (
    <nav className="section-nav" aria-label="On this page">
      <div className="wrap">
        {items.map(([id, label]) => <a key={id} href={`#${id}`} className={active === id ? "active" : undefined} aria-current={active === id ? "true" : undefined}>{label}</a>)}
      </div>
    </nav>
  );
}
