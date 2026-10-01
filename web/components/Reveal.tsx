"use client";
import { useReveal } from "./useReveal";

/** Fades a block up into place the first time it scrolls into view. A block already on screen when the
 * page loads is just shown; nothing is hidden in the server's HTML. */
export default function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const { ref, hidden, animate, reduce } = useReveal<HTMLDivElement>(80);
  return (
    <div ref={ref} style={{
      opacity: hidden ? 0 : 1, transform: hidden ? "translateY(16px)" : "none",
      transition: reduce || !animate ? "none" : `opacity .5s cubic-bezier(.2,.7,.2,1) ${delay}s, transform .5s cubic-bezier(.2,.7,.2,1) ${delay}s`,
    }}>
      {children}
    </div>
  );
}
