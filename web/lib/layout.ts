import { TILES } from "./tiles";

/** Parliament (hemicycle) seat positions, ordered left to right by angle. */
export function hemicycle(n: number, rows?: number) {
  const R = rows ?? Math.max(4, Math.round(Math.sqrt(n / 4.2)));
  const r0 = 0.42, r1 = 1.0;
  const radii = Array.from({ length: R }, (_, i) => r0 + ((r1 - r0) * i) / Math.max(R - 1, 1));
  const tot = radii.reduce((a, b) => a + b, 0);
  let counts = radii.map((r) => Math.round((n * r) / tot));
  let diff = n - counts.reduce((a, b) => a + b, 0);
  for (let i = R - 1; diff !== 0; i = (i - 1 + R) % R) { counts[i] += Math.sign(diff); diff -= Math.sign(diff); }
  const pts: { x: number; y: number; a: number }[] = [];
  radii.forEach((r, i) => {
    const k = counts[i];
    for (let j = 0; j < k; j++) {
      const a = Math.PI - (k === 1 ? Math.PI / 2 : (j / (k - 1)) * Math.PI);
      pts.push({ x: r * Math.cos(a), y: -r * Math.sin(a), a });
    }
  });
  pts.sort((p, q) => q.a - p.a || Math.hypot(p.x, p.y) - Math.hypot(q.x, q.y));
  const seatR = Math.min(0.9 * ((r1 - r0) / Math.max(R - 1, 1)) / 2, (Math.PI * r1) / Math.max(...counts) / 2 * 0.9);
  return { pts, seatR };
}

export type HexCell = { st: string; d: number; x: number; y: number };
export type HexState = { st: string; x: number; y: number; w: number; h: number };

/** District hex map laid out by geography: each state is a compact block of
 * hexes (one per district, on the 2026 lines) placed at its spot on the state
 * tile grid, nudged so blocks never overlap. */
export function hexLayout(counts: Record<string, number>) {
  const R = 1, HW = Math.sqrt(3) * R, RH = 1.5 * R;
  const UNIT = 4.2 * HW;
  const cells: HexCell[] = [];
  const blocks: HexState[] = [];
  const rows = new Map<number, [string, number][]>();
  for (const [st, [c, r]] of Object.entries(TILES)) {
    if (!counts[st]) continue;
    (rows.get(r) ?? rows.set(r, []).get(r)!).push([st, c]);
  }
  let y0 = 0;
  for (const r of [...rows.keys()].sort((a, b) => a - b)) {
    const list = rows.get(r)!.sort((a, b) => a[1] - b[1]);
    let xEnd = -Infinity, rowH = 0;
    for (const [st, c] of list) {
      const n = counts[st];
      const w = Math.max(1, Math.ceil(Math.sqrt(n * 1.25)));
      const h = Math.ceil(n / w);
      const x0 = Math.max(c * UNIT, xEnd + HW * 1.2);
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / w), col = i % w;
        cells.push({ st, d: i + 1, x: x0 + col * HW + (row % 2 ? HW / 2 : 0), y: y0 + row * RH });
      }
      const bw = w * HW + (h > 1 ? HW / 2 : 0);
      blocks.push({ st, x: x0, y: y0, w: bw, h: (h - 1) * RH + 2 * R });
      xEnd = x0 + bw;
      rowH = Math.max(rowH, (h - 1) * RH + 2 * R);
    }
    y0 += rowH + 2.2 * R;
  }
  const minX = Math.min(...cells.map((c) => c.x)) - HW, maxX = Math.max(...cells.map((c) => c.x)) + HW;
  const minY = Math.min(...cells.map((c) => c.y)) - 2.4 * R, maxY = Math.max(...cells.map((c) => c.y)) + 1.4 * R;
  return { cells, blocks, box: [minX, minY, maxX - minX, maxY - minY] as [number, number, number, number], R };
}

export function hexPath(cx: number, cy: number, r: number) {
  const p = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    p.push(`${(cx + r * Math.cos(a)).toFixed(3)},${(cy + r * Math.sin(a)).toFixed(3)}`);
  }
  return `M${p.join("L")}Z`;
}
