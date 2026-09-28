"use client";
import { createContext, useContext, useState } from "react";
import type { Version } from "@/lib/types";

const Ctx = createContext<{ v: Version; set: (v: Version) => void }>({ v: "fundamentals", set: () => {} });
export const useVersion = () => useContext(Ctx);

export function VersionProvider({ initial, children }: { initial: Version; children: React.ReactNode }) {
  const [v, set] = useState<Version>(initial);
  return <Ctx.Provider value={{ v, set }}>{children}</Ctx.Provider>;
}

const LABELS: [Version, string][] = [["polls", "Polls only"], ["fundamentals", "+ Fundamentals"], ["experts", "+ Expert ratings"]];

export function VersionToggle() {
  const { v, set } = useVersion();
  return (
    <div className="toggle" role="group" aria-label="Forecast version">
      {LABELS.map(([id, label]) => (
        <button key={id} aria-pressed={v === id} onClick={() => set(id)}>{label}</button>
      ))}
    </div>
  );
}
