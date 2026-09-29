"use client";
import dynamic from "next/dynamic";

/** The geographic map is drawn in the browser only, so its ~100 KB of state
 * outlines aren't repeated in every page's HTML. A same-size placeholder keeps
 * the layout from jumping while it loads. */
const StateMap = dynamic(() => import("./StateMap"), {
  ssr: false,
  loading: () => <div className="skeleton" style={{ aspectRatio: "975 / 650", width: "100%" }} aria-label="Loading map" />,
});
export default StateMap;
