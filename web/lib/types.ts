export type Version = "polls" | "fundamentals" | "experts";
export type Party = "D" | "R" | "I" | "L" | "G" | "O";
export type Bucket =
  | "d-safe" | "d-likely" | "d-lean" | "tossup" | "r-lean" | "r-likely" | "r-safe"
  | "i-safe" | "i-likely" | "i-lean";

export interface Side { name: string | null; party: Party | null }

export interface RaceRow {
  id: string;
  office: "senate" | "house" | "governor";
  state: string;
  state_name: string;
  district: number | null;
  special: boolean;
  title: string;
  kind: "two_party" | "same_party" | "uncontested" | "no_candidates";
  dside: Side;
  rside: Side;
  incumbent: string | null;
  incumbent_party: Party | null;
  open: boolean;
  pvi: number | null;
  p: Record<Version, number>;
  rating: Record<Version, Bucket>;
  margin: Record<Version, number | null>;
  p_party: Partial<Record<Party, number>>;
  n_polls: number;
  poll_avg: number | null;
  experts: Record<string, string>;
  rules: Record<string, boolean>;
  p_runoff: number | null;
}

export interface Hist { seats: number; p: number }
export interface Chamber {
  p_control: { D: number; R: number; contingent: number };
  seats_hist: Hist[];
  median_seats: { D: number; R: number };
  mean_seats: { D: number; R: number };
  p80: [number, number];
  tipping: { id: string; p: number }[];
  not_up?: { D: number; R: number; I_caucus_D: number };
}
export interface Forecast {
  updated: string;
  asof: string;
  election_date: string;
  days_to_election: number;
  model_version: string;
  n_sims: number;
  versions: { id: Version; label: string }[];
  default_version: Version;
  national: { environment: number; environment_sd: number; generic_avg: number; generic_weight: number; approval_net: number };
  chambers: Record<Version, { senate: Chamber; house: Chamber; governor: { mean_won: Record<string, number>; seats_hist: Hist[] } }>;
  markets: { source: string; chamber: "senate" | "house"; title: string; url: string; p: Partial<Record<"D" | "R", number>> }[];
  changes: { id: string; title: string; office: string; from: number; to: number; reason: string }[];
  counts: Record<string, number>;
  sources: { name: string; url: string; use: string }[];
}

export interface TrendPoint { date: string; margin: number; se: number }
export interface PollRow {
  pollster: string; rated_as: string | null; grade: string | null; start: string; end: string; n: number | null;
  pop: string | null; sponsors: string[]; partisan: string | null; internal: boolean; url: string | null;
  answers: Record<string, number>; raw: number; adjusted: number; house_effect: number; pop_adj: number;
  timeline_adj: number; weight: number;
}
export interface RaceDetail extends RaceRow {
  candidates: { name: string; party: Party; party_label: string; incumbent: boolean; wiki?: string | null;
    bio?: { title: string; description?: string | null; bio?: string; url?: string | null; website?: string | null } }[];
  dist?: number[];
  odds_trend?: { date: string; p: number }[];
  money?: { d: MoneySide | null; r: MoneySide | null } | null;
  notes: string[];
  poll_close_et: string | null;
  interval: { p10: number | null; p90: number | null; median: number | null };
  summary: string;
  model?: {
    poll_avg: number | null; poll_se: number | null; n_eff: number | null; fundamentals: number | null; fund_sd: number;
    experts: number | null; national_env: number; pvi: number | null; incumbency: number; poll_weight: number;
    mean: number; sd: number; drift_sd: number;
    incumbent_history?: { race: string; cycle: string; actual: number; expected: number; over: number; carry: number } | null;
  };
  polls?: PollRow[];
  trend?: TrendPoint[];
}

export interface MoneySide { receipts: number | null; disbursements: number | null; cash_on_hand: number | null; through: string; fec_id?: string; fec_name?: string }
