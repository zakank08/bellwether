"use client";
import { createContext, useCallback, useContext, useState } from "react";

type Tip = { x: number; y: number; content: React.ReactNode } | null;
const Ctx = createContext<{ show: (e: { clientX: number; clientY: number }, c: React.ReactNode) => void; hide: () => void }>({ show: () => {}, hide: () => {} });
export const useTip = () => useContext(Ctx);

export function TipProvider({ children }: { children: React.ReactNode }) {
  const [tip, setTip] = useState<Tip>(null);
  const show = useCallback((e: { clientX: number; clientY: number }, content: React.ReactNode) => setTip({ x: e.clientX, y: e.clientY, content }), []);
  const hide = useCallback(() => setTip(null), []);
  let style: React.CSSProperties = {};
  if (tip) {
    const w = typeof window !== "undefined" ? window.innerWidth : 1000;
    const left = tip.x + 16 + 280 > w ? tip.x - 16 - 280 : tip.x + 16;
    style = { left: Math.max(8, left), top: tip.y + 16, transition: "left 80ms linear, top 80ms linear" };
  }
  return (
    <Ctx.Provider value={{ show, hide }}>
      {children}
      {tip && <div className="tip" role="tooltip" style={style}>{tip.content}</div>}
    </Ctx.Provider>
  );
}
