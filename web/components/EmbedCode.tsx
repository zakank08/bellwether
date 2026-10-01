"use client";
import { useState } from "react";

export default function EmbedCode({ id, title, path = "race", height = 170 }: { id: string; title: string; path?: "race" | "chamber"; height?: number }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const src = `${typeof window !== "undefined" ? window.location.origin : ""}/embed/${path}/${id}/`;
  const code = `<iframe src="${src}" title="${title} forecast" width="100%" height="${height}" style="border:0;max-width:520px" loading="lazy"></iframe>`;
  return (
    <div style={{ position: "relative" }}>
      <button className="btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{"</>"} Embed</button>
      {open && (
        <div className="embed-pop" role="dialog" aria-label={`Embed ${title}`}>
          <p className="small muted" style={{ margin: "0 0 6px" }}>Paste this into any web page. It updates with the forecast.</p>
          <textarea className="embed-code" readOnly rows={3} value={code} onFocus={(e) => e.currentTarget.select()} aria-label="Embed code" />
          <button className="btn" style={{ marginTop: 6 }} onClick={() => navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); })}>{copied ? "Copied ✓" : "Copy code"}</button>
        </div>
      )}
    </div>
  );
}
