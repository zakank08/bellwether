"use client";
import { animate, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";

/** Tabular-figure number that eases to a new value when it changes (for example when the forecast version is
 * switched). It shows the real number from the first paint and never counts up from zero on load. */
export default function CountUp({ value, format = (n: number) => String(Math.round(n)), duration = 0.6 }: {
  value: number; format?: (n: number) => string; duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce || prev.current === value) { el.textContent = format(value); prev.current = value; return; }
    const c = animate(prev.current, value, { duration, ease: [0.2, 0.7, 0.2, 1], onUpdate: (n) => { el.textContent = format(n); } });
    prev.current = value;
    return () => c.stop();
  }, [value, reduce]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span ref={ref} className="num">{format(value)}</span>;
}
