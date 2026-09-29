"use client";
import { useEffect, useState } from "react";
import { follow, isFollowing, unfollow } from "@/lib/follow";

export default function FollowButton({ id, p, title }: { id: string; p: number; title: string }) {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    const sync = () => setOn(isFollowing(id));
    sync();
    window.addEventListener("bw-follow", sync);
    return () => window.removeEventListener("bw-follow", sync);
  }, [id]);
  if (on == null) return <button className="btn" disabled aria-hidden="true" style={{ visibility: "hidden" }}>Follow</button>;
  return (
    <button className={`btn${on ? " btn-primary" : ""}`} aria-pressed={on}
      onClick={() => (on ? unfollow(id) : follow(id, p))}
      title={on ? `Stop following ${title}` : `Follow ${title}: it will appear under “Your races” on the home page, with changes since your last visit`}>
      {on ? "★ Following" : "☆ Follow"}
    </button>
  );
}
