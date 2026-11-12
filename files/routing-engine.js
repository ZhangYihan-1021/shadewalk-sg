/* Routes on the supplied walking graph; popularity selects stops, never street costs. */
window.createWalkingRouter = function (D) {
  const adjacency = Array.from({ length: window.SHADE_NETWORK.nodes.length }, () => []);
  D.segs.forEach((g, i) => {
    adjacency[g[6]].push([g[7], i + 1]);
    adjacency[g[7]].push([g[6], -(i + 1)]);
  });
  const cache = new Map();
  function cost(cfg, i) {
    const g = D.segs[i];
    if (cfg === 'A') return g[1];
    const w = D.weights[+cfg.at(-1)];
    const shaded = cfg[0] === 'B' ? g[2] : cfg[0] === 'D' ? g[12][+cfg[1]] : cfg[0] === 'P' ? g[14] : g[5][+cfg[1]];
    return ((g[1] - shaded) * w + shaded) * g[9];
  }
  function tree(cfg, source) {
    const key = cfg + ':' + source;
    if (cache.has(key)) {
      const value = cache.get(key); cache.delete(key); cache.set(key, value); return value;
    }
    const dist = new Float64Array(adjacency.length).fill(Infinity);
    const prev = new Int32Array(adjacency.length).fill(-1);
    const edge = new Int32Array(adjacency.length);
    const heap = [];
    function push(value) {
      let i = heap.length; heap.push(value);
      while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= value[0]) break; heap[i] = heap[p]; i = p; }
      heap[i] = value;
    }
    function pop() {
      const first = heap[0], last = heap.pop();
      if (heap.length) {
        let i = 0;
        while (i * 2 + 1 < heap.length) {
          let c = i * 2 + 1;
          if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++;
          if (last[0] <= heap[c][0]) break;
          heap[i] = heap[c]; i = c;
        }
        heap[i] = last;
      }
      return first;
    }
    dist[source] = 0; push([0, source]);
    while (heap.length) {
      const [d, u] = pop(); if (d !== dist[u]) continue;
      for (const [v, signed] of adjacency[u]) {
        const next = d + cost(cfg, Math.abs(signed) - 1);
        if (next < dist[v]) { dist[v] = next; prev[v] = u; edge[v] = signed; push([next, v]); }
      }
    }
    const value = { dist, prev, edge };
    cache.set(key, value);
    if (cache.size > 64) cache.delete(cache.keys().next().value);
    return value;
  }
  function path(t, source, target) {
    const out = [];
    if (!Number.isFinite(t.dist[target])) throw Error('No connected walking path');
    while (target !== source) { out.push(t.edge[target]); target = t.prev[target]; }
    return out.reverse();
  }
  function leg(cfg, a, b) {
    if (a[0] === 's' || a[0] === 'x') {
      const result = leg(cfg, b, a);
      return { s: result.s.slice().reverse().map(v => -v), exit: result.exit };
    }
    const p = D.pois[+a.slice(1)], t = tree(cfg, p.node);
    if (b[0] === 'p') return { s: path(t, p.node, D.pois[+b.slice(1)].node) };
    if (b[0] === 'x') { const x = +b.slice(1); return { s: path(t, p.node, D.exits[x].node), exit: x }; }
    let best = null, distance = Infinity;
    D.exits.forEach((x, i) => {
      if (x.st === +b.slice(1) && t.dist[x.node] + x.snap < distance) {
        best = i; distance = t.dist[x.node] + x.snap;
      }
    });
    return { s: path(t, p.node, D.exits[best].node), exit: best };
  }
  return { leg, cost };
};
