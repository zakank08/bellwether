import type { Metadata } from "next";
import { GLOSSARY } from "@/lib/glossary";

export const metadata: Metadata = { title: "Glossary", description: "Plain-English meanings of the terms used on Bellwether: odds, toss-up, partisan lean, house effects and more." };

export default function Page() {
  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <header className="masthead">
        <div className="kicker">Reference</div>
        <h1>Glossary</h1>
        <p className="dek">The terms used across the forecast, in plain English. The same definitions appear in the small “?” buttons on each page.</p>
      </header>
      <dl className="glossary">
        {Object.entries(GLOSSARY).map(([k, [term, def]]) => (
          <div key={k} id={k} style={{ padding: "14px 0", borderTop: "1px solid var(--line)" }}>
            <dt style={{ fontWeight: 600 }}>{term}</dt>
            <dd style={{ margin: "4px 0 0" }}>{def}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
