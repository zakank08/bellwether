"use client";
import { motion, useReducedMotion } from "framer-motion";
import { useAfterFirstLoad } from "@/components/useReveal";

/** Soft page transition between routes. The first page you open (or refresh) is shown at once; only
 * later navigations fade in, so the page never flashes from invisible. */
export default function Template({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const later = useAfterFirstLoad();
  if (reduce || !later) return <>{children}</>;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}
