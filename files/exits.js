/* Every exit of the stations around the study area, snapped to the nearest node of the walking graph.
   Exits further than SNAP_LIMIT_M from the graph are left out rather than joined by a long guess. */
const SNAP_LIMIT_M = 120;
function installExits(D) {
  const net = window.SHADE_NETWORK, kx = 111320 * Math.cos(1.29 * Math.PI / 180), ky = 110574;
  const used = new Set();
  D.segs.forEach(g => { used.add(g[6]); used.add(g[7]); });
  const nodes = [...used];
  const stations = [], exits = [], byName = new Map();
  let dropped = 0;
  for (const x of window.MRT_EXITS) {
    let best = -1, d = Infinity;
    for (const n of nodes) {
      const p = net.nodes[n], dd = Math.hypot((p[0] - x.lng) * kx, (p[1] - x.lat) * ky);
      if (dd < d) { d = dd; best = n; }
    }
    if (d > SNAP_LIMIT_M) { dropped++; continue; }
    if (!byName.has(x.station)) { byName.set(x.station, stations.length); stations.push({ name: x.station, lng: 0, lat: 0, n: 0 }); }
    const st = byName.get(x.station), s = stations[st];
    s.lng += x.lng; s.lat += x.lat; s.n++;
    exits.push({ st, code: x.code, lng: x.lng, lat: x.lat, node: best, snap: Math.round(d * 10) / 10 });
  }
  stations.forEach(s => { s.lng /= s.n; s.lat /= s.n; delete s.n; });
  D.stations = stations;
  D.exits = exits;
  D.exitsDropped = dropped;
}
const exitsOf = st => D.exits.map((x, i) => [x, i]).filter(([x]) => x.st === st);
