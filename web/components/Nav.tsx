"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/", "Forecast"], ["/whatif/", "What if?"], ["/senate/", "Senate"], ["/house/", "House"], ["/governor/", "Governors"], ["/schedule/", "Election night"],
  ["/polls/", "Polls"], ["/pollsters/", "Pollsters"], ["/methodology/", "How it works"],
] as const;

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={path === href || (href !== "/" && path?.startsWith(href)) ? "page" : undefined}>{label}</Link>
      ))}
    </nav>
  );
}
