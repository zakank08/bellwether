/** Plain-English definitions, opened by tap or keyboard (not hover-only). */
export const GLOSSARY: Record<string, [string, string]> = {
  simulation: ["Simulations", "The model plays out the election 40,000 times with realistic randomness. “71 in 100” means one side won in about 71 of every 100 of those runs."],
  odds: ["“X in 100”", "The share of simulations a side wins. A 70-in-100 favorite still loses 3 times out of 10 — about as often as a good basketball player misses a free throw."],
  tossup: ["Toss-up", "Neither side wins more than 60 of 100 simulations."],
  pvi: ["Partisan lean (PVI)", "How much more Democratic or Republican a state or district votes than the country as a whole, from recent presidential results. R+5 means about 5 points more Republican than the nation."],
  environment: ["National environment", "How the country as a whole is leaning this year, measured mostly by the generic ballot (“which party would you vote for in your district?”). Moving it shifts every race at once."],
  house: ["House effect", "Some pollsters consistently lean a bit toward one party compared with other pollsters. We measure that lean and adjust it out."],
  lv: ["Likely voters", "Polls of people screened as likely to vote. Polls of all registered voters or all adults are adjusted to a likely-voter basis."],
  tipping: ["Tipping-point race", "The race that would hand a party its majority if you lined up all races from that party’s strongest to its weakest."],
  fundamentals: ["Fundamentals", "What we’d expect without polls: the state’s partisan lean, the national environment, incumbency and the incumbent’s past track record."],
  conditional: ["How picks move other races", "Races are linked: if polls are off in Iowa, they’re probably off in Kansas too. Picking a winner keeps only the simulations where that happened, so related races shift with it. If your picks are too unusual to find in the simulations, the other races stay at the forecast instead."],
  path: ["Likeliest path", "Seats a party is very likely to win (95+ in 100), then its best remaining chances in order, until it reaches a majority."],
  moe: ["The band on poll charts", "The shaded range shows where the true polling average likely sits, given how many polls there are and how much they disagree."],
};

