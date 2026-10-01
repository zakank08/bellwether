"use client";
import { useEffect, useId, useRef, useState } from "react";

import { GLOSSARY } from "@/lib/glossary";
export { GLOSSARY };

export default function InfoTip({ term }: { term: keyof typeof GLOSSARY | string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const entry = GLOSSARY[term];
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  if (!entry) return null;
  return (
    <span className="infotip" ref={ref}>
      <button type="button" aria-expanded={open} aria-controls={id} aria-label={`What is “${entry[0]}”?`} onClick={() => setOpen((o) => !o)}>?</button>
      {open && <span id={id} role="note" className="infotip-pop"><strong>{entry[0]}</strong><br />{entry[1]}</span>}
    </span>
  );
}
