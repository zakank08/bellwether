"use client";
import { useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/** Entrance animation without the flash.
 *
 * The server's HTML (and the first browser paint) shows the finished picture, so a page that is
 * refreshed or opened never flickers from empty to full. After load, anything already on screen
 * simply stays put. Only things that start below the visible screen are tucked away ("hidden")
 * and then animate in the first time they scroll into view. Reduced-motion readers never animate. */
export function useReveal<T extends Element>(margin = 60) {
  const ref = useRef<T>(null);
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<"ssr" | "static" | "armed" | "animated">("ssr");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) { setPhase("static"); return; }
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) { setPhase("static"); return; }
    setPhase("armed");
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setPhase("animated"); io.disconnect(); } }, { rootMargin: `0px 0px -${margin}px 0px` });
    io.observe(el);
    return () => io.disconnect();
  }, [reduce, margin]);
  return { ref, hidden: phase === "armed", animate: phase === "animated", reduce: !!reduce };
}

let hydrated = false;
/** True once the first page has been shown, so later route changes (not the first load) may animate. */
export function useAfterFirstLoad() {
  const [later] = useState(() => hydrated);
  useEffect(() => { hydrated = true; }, []);
  return later;
}
