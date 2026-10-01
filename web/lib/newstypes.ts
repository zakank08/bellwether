/** Types and labels for the Latest feed. Kept apart from news.ts (which reads files) so client components can import them. */
export type NewsKind = "note" | "odds" | "race" | "poll" | "date";
export type NewsItem = { id: string; kind: NewsKind; date: string; headline: string; short?: string; detail?: string; href?: string; source?: string; pinned?: boolean };
export const KIND_LABEL: Record<NewsKind, string> = { note: "Note", odds: "Control odds", race: "Race movers", poll: "New poll", date: "Dates" };
