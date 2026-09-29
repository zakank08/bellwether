import type { Metadata } from "next";
import WhatIf from "@/components/WhatIf";

export const metadata: Metadata = {
  title: "What if? Build your own map",
  description: "Pick Senate and House winners, shift the national environment, and see how control of Congress changes.",
};

export default function Page() {
  return <WhatIf />;
}
