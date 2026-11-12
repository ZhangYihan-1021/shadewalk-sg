/* Popular route: same stops, but prefers streets near places with more sampled Instagram posts.
   The street weight is internal. The page only reports post counts, not a popularity score. */
const POPULAR_RADIUS_M = 60;
let popVersion = 0, popKey = null;
function installPopular(D) {
  const [ox, oy, k] = D.origin, kx = 111320 * Math.cos(1.29 * Math.PI / 180), ky = 110574;
  const cell = POPULAR_RADIUS_M / ky, grid = new Map();
  D.pois.forEach((p, i) => {
    const key = Math.floor(p.lng / cell) + ":" + Math.floor(p.lat / cell);
    (grid.get(key) || grid.set(key, []).get(key)).push(i);
  });
  D.segs.forEach(g => {
    const near = new Set(), enc = g[0];
    let x = 0, y = 0, px = null, py = null;
    const probe = (lng, lat) => {
      const cx = Math.floor(lng / cell), cy = Math.floor(lat / cell);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        for (const i of grid.get((cx + a) + ":" + (cy + b)) || []) {
          const p = D.pois[i];
          if (Math.hypot((p.lng - lng) * kx, (p.lat - lat) * ky) <= POPULAR_RADIUS_M) near.add(i);
        }
      }
    };
    for (let c = 0; c < enc.length; c += 2) {
      x += enc[c]; y += enc[c + 1];
      const lng = ox + x / k, lat = oy + y / k;
      if (px != null) {
        const n = Math.floor(Math.hypot((lng - px) * kx, (lat - py) * ky) / 40);
        for (let q = 1; q <= n; q++) probe(px + (lng - px) * q / (n + 1), py + (lat - py) * q / (n + 1));
      }
      probe(lng, lat);
      px = lng; py = lat;
    }
    g[13] = [...near];
    g[14] = 0;
  });
}
function updatePopular() {
  const [from, to] = periodBounds(), key = `${from}|${to}|${state.includeCaptions}`;
  if (key === popKey) return;
  popKey = key;
  popVersion++;
  const totals = D.pois.map((_, i) => popularity(i).total);
  const raw = D.segs.map(g => g[13].reduce((n, i) => n + totals[i], 0));
  const positive = raw.filter(v => v > 0).sort((a, b) => a - b);
  const cap = positive.length ? positive[Math.floor(positive.length * .98)] : 1;
  D.segs.forEach((g, n) => { g[14] = g[1] * Math.min(1, Math.log1p(raw[n]) / Math.log1p(cap || 1)); });
}
function popularCfg() {
  updatePopular();
  return `P${popVersion}_${state.w}`;
}
function routePosts(legs) {
  const stops = new Set(legs.flatMap(l => [l.from, l.to]).filter(n => n[0] === "p").map(n => +n.slice(1)));
  const near = new Set();
  legs.forEach(l => l.s.forEach(v => D.segs[Math.abs(v) - 1][13].forEach(i => near.add(i))));
  stops.forEach(i => near.add(i));
  const rows = [...near].map(i => ({ i, n: popularity(i).total })).filter(x => x.n > 0).sort((a, b) => b.n - a.n);
  return { total: rows.reduce((s, x) => s + x.n, 0), places: rows.length, top: rows.filter(x => !stops.has(x.i)).slice(0, 4) };
}
