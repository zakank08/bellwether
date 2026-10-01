"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Site-wide polish, in the spirit of Apple's pages: sections and cards ease into place as they scroll into view,
 * the header turns to frosted glass once you scroll, and a "Back to top" button appears on long pages.
 *
 * Nothing is hidden in the server's HTML. After the page loads, only things that start *below* the screen are tucked
 * away and then revealed, so refreshing never flashes. People who ask their device to reduce motion get none of the movement. */
const GROUPS = ".race-card-grid > *, .state-grid > li, .news-cards > *, .intro > div, .tl-state, .upcoming > li";
const SECTIONS = "main .block, main .home-tools, main .news-strip, main .news-day, main .live-panel";

export default function ScrollFX() {
  const path = usePathname();
  const [top, setTop] = useState(false);

  useEffect(() => {
    const head = document.querySelector(".site-head");
    const on = () => { head?.classList.toggle("scrolled", window.scrollY > 6); setTop(window.scrollY > 900); };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const vh = window.innerHeight;
    const armed: Element[] = [];
    const arm = (el: Element, delay = 0) => {
      const r = el.getBoundingClientRect();
      if (r.height === 0 || r.top < vh || el.classList.contains("fx-armed") || el.closest(".reveal-wrap")) return; // on screen already, or not drawn: leave alone
      (el as HTMLElement).style.setProperty("--fx-d", `${delay}s`);
      el.classList.add("fx-armed");
      armed.push(el);
    };
    // groups first (cards arrive one after another), then sections that hold no group of their own
    document.querySelectorAll("main").forEach((m) => m.querySelectorAll(GROUPS).forEach((el) => {
      const sib = Array.from(el.parentElement?.children ?? []);
      arm(el, Math.min(sib.indexOf(el) % 6, 5) * 0.06);
    }));
    document.querySelectorAll(SECTIONS).forEach((el) => { if (!el.querySelector(GROUPS)) arm(el); });

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("fx-in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.01 });
    armed.forEach((el) => io.observe(el));
    return () => { io.disconnect(); armed.forEach((el) => el.classList.remove("fx-armed", "fx-in")); };
  }, [path]);

  return (
    <button type="button" className={`to-top${top ? " show" : ""}`} aria-label="Back to top" tabIndex={top ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
    </button>
  );
}
