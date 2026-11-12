/* Route line drawn on a canvas that repaints with every map frame, so corners and hairpins stay
   smooth while zooming. Each frame works in screen pixels: simplify, split repeated streets into
   lanes, join reversals with a U-turn, then round every corner. This changes the drawing only;
   distances and routing come from the network. */
const RouteOverlay = (() => {
  let map = null, cv = null, ctx = null, width = 0, height = 0, ratio = 1;
  let selected = null, selectedSig = "", connectors = [], fadeFrom = 0, palette = null;
  const FADE_MS = 240, ANCHOR_M = 25;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const hyp = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  /* Split a route into spans: stretches that are either not repeated, or one pass along a repeated street. */
  function prepare(r, time) {
    const steps = r.legs.flatMap((l, leg) => l.s.map(v => ({ i: Math.abs(v) - 1, dir: v > 0 ? 1 : -1, leg })));
    const uses = {}, seen = {};
    steps.forEach(s => { uses[s.i] = (uses[s.i] || 0) + 1; });
    const spans = [];
    let cur = null, prev = null;
    for (const s of steps) {
      const raw = segCoords(s.i), coords = s.dir > 0 ? raw : raw.slice().reverse(), repeated = uses[s.i] > 1;
      let lane = 0;
      if (repeated) { const key = s.i + ":" + s.dir; lane = seen[key] || 0; seen[key] = lane + 1; }
      const reverses = prev && prev.i === s.i && prev.dir !== s.dir;
      if (reverses && cur) cur.hair = true;
      if (!cur || reverses || cur.repeated !== repeated || cur.lane !== lane || cur.leg !== s.leg) {
        const first = !cur;
        cur = { repeated, lane, leg: s.leg, hair: false, afterHair: !!reverses, verts: [] };
        spans.push(cur);
        if (!first && !reverses) { const last = spans[spans.length - 2].verts.at(-1); cur.verts.push(last); }
      }
      const c = shadeClass(D.segs[s.i], time);
      for (const p of coords) {
        const last = cur.verts.at(-1);
        if (!last || last[0] !== p[0] || last[1] !== p[1]) cur.verts.push([p[0], p[1], c]);
      }
      prev = s;
    }
    const kept = spans.filter(s => s.verts.length > 1);
    return { spans: kept, anchors: arrowAnchors(kept) };
  }

  /* Arrow positions fixed in metres along the route, so they never slide while zooming. The level says
     how far apart its arrows sit: higher levels stay visible when zoomed out, others fade in as you zoom. */
  function arrowAnchors(spans) {
    const kx = 111320 * Math.cos(1.29 * Math.PI / 180), ky = 110574, anchors = [];
    let walked = 0, n = 1;
    spans.forEach((s, sp) => {
      for (let k = 1; k < s.verts.length; k++) {
        const a = s.verts[k - 1], b = s.verts[k], d = Math.hypot((b[0] - a[0]) * kx, (b[1] - a[1]) * ky);
        while (d > 0 && walked + d >= n * ANCHOR_M) {
          const t = (n * ANCHOR_M - walked) / d;
          let level = 0, q = n;
          while (q % 2 === 0 && level < 8) { q /= 2; level++; }
          anchors.push({ sp, level, lng: a[0] + (b[0] - a[0]) * t, lat: a[1] + (b[1] - a[1]) * t });
          n++;
        }
        walked += d;
      }
    });
    return anchors;
  }

  /* Douglas-Peucker in pixels, keeping the points where the colour changes. */
  function simplify(pts, tol) {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    for (let k = 1; k < pts.length; k++) if (pts[k].c !== pts[k - 1].c) keep[k] = keep[k - 1] = 1;
    const stack = [];
    let start = 0;
    for (let k = 1; k < pts.length; k++) if (keep[k]) { stack.push([start, k]); start = k; }
    while (stack.length) {
      const [a, b] = stack.pop();
      if (b - a < 2) continue;
      const A = pts[a], B = pts[b], dx = B.x - A.x, dy = B.y - A.y, len2 = dx * dx + dy * dy;
      let far = -1, max = tol * tol;
      for (let k = a + 1; k < b; k++) {
        const t = len2 ? clamp(((pts[k].x - A.x) * dx + (pts[k].y - A.y) * dy) / len2, 0, 1) : 0;
        const ex = A.x + t * dx - pts[k].x, ey = A.y + t * dy - pts[k].y, d = ex * ex + ey * ey;
        if (d > max) { max = d; far = k; }
      }
      if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
    }
    return pts.filter((_, k) => keep[k]);
  }

  /* Offset to the right of travel, easing in and out so a lane leaves the shared line in a soft curve. */
  function offsetSpan(pts, off, taperStart, taperEnd) {
    const total = pts.reduce((s, p, k) => k ? s + hyp(p, pts[k - 1]) : 0, 0);
    if (!off || total < 1) return pts;
    const taper = Math.min(total / 2, Math.max(26, off * 5));
    const out = [];
    let walked = 0;
    const amount = d => {
      const a = taperStart ? smoothstep(0, taper, d) : 1, b = taperEnd ? smoothstep(0, taper, total - d) : 1;
      return off * a * b;
    };
    const normalAt = k => {
      const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[Math.min(pts.length - 1, k + 1)];
      let ax = p1.x - p0.x, ay = p1.y - p0.y, bx = p2.x - p1.x, by = p2.y - p1.y;
      const la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
      ax /= la; ay /= la; bx /= lb; by /= lb;
      let nx = ay + by, ny = -ax - bx;
      const n = Math.hypot(nx, ny) || 1;
      nx /= n; ny /= n;
      const m = 1 / Math.max(.55, nx * (k < pts.length - 1 ? by : ay) + ny * (k < pts.length - 1 ? -bx : -ax));
      return [nx * m, ny * m];
    };
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k], [nx, ny] = normalAt(k), o = amount(walked);
      out.push({ x: p.x + nx * o, y: p.y + ny * o, c: p.c, sp: p.sp });
      if (k === pts.length - 1) break;
      const next = pts[k + 1], seg = hyp(p, next), [mx, my] = normalAt(k + 1);
      // Extra points only where the offset is changing.
      if (taperStart || taperEnd) {
        const n = Math.ceil(seg / 7);
        for (let q = 1; q < n; q++) {
          const t = q / n, d = walked + seg * t;
          if ((taperStart && d < taper) || (taperEnd && total - d < taper)) {
            const ox = nx + (mx - nx) * t, oy = ny + (my - ny) * t, v = amount(d);
            out.push({ x: p.x + (next.x - p.x) * t + ox * v, y: p.y + (next.y - p.y) * t + oy * v, c: p.c, sp: p.sp });
          }
        }
      }
      walked += seg;
    }
    return out;
  }

  /* Rounds every corner with a quadratic curve. Short segments chain into one smooth curve. */
  function rounded(pts, radius) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    for (let k = 1; k < pts.length - 1; k++) {
      const p = pts[k];
      if (p.lock) { out.push(p); continue; }
      const a = pts[k - 1], b = pts[k + 1], la = hyp(a, p), lb = hyp(p, b);
      if (la < .01 || lb < .01) continue;
      const ca = Math.min(radius, la / 2) / la, cb = Math.min(radius, lb / 2) / lb;
      const A = { x: p.x + (a.x - p.x) * ca, y: p.y + (a.y - p.y) * ca }, B = { x: p.x + (b.x - p.x) * cb, y: p.y + (b.y - p.y) * cb };
      const n = clamp(Math.ceil((la * ca + lb * cb) / 5), 2, 9);
      for (let q = 0; q <= n; q++) {
        const t = q / n, u = 1 - t;
        out.push({ x: u * u * A.x + 2 * u * t * p.x + t * t * B.x, y: u * u * A.y + 2 * u * t * p.y + t * t * B.y, c: q * 2 < n ? a.c : p.c, sp: p.sp });
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  function screenLine(route, lineW, zoomRadius) {
    const laneGap = lineW * .58;
    const parts = route.spans.map((s, sp) => {
      const raw = s.verts.map(v => { const p = map.project([v[0], v[1]]); return { x: p.x, y: p.y, c: v[2], sp }; });
      const pts = simplify(raw, 1.6);
      const total = pts.reduce((sum, p, k) => k ? sum + hyp(p, pts[k - 1]) : 0, 0);
      // A hairpin opens as it grows on screen, and short repeats stay on one line instead of wobbling.
      const off = s.repeated ? (s.lane + 1) * laneGap * smoothstep(22, 70, total) : 0;
      return { s, line: offsetSpan(pts, off, off > 0 && !s.afterHair, off > 0 && !s.hair) };
    });
    // Each leg becomes its own layer, starting where the previous leg ended.
    const layers = [];
    let out = [];
    parts.forEach((part, n) => {
      const line = part.line, prev = parts[n - 1];
      let arc = [];
      if (out.length && prev) {
        const last = out[out.length - 1], first = line[0];
        if (prev.s.hair && hyp(last, first) > .4) {
          // U-turn: half circle between the two lanes, bulging past the turning point.
          const before = out[Math.max(0, out.length - 2)], dl = hyp(before, last) || 1, dx = (last.x - before.x) / dl, dy = (last.y - before.y) / dl;
          const cx = (last.x + first.x) / 2, cy = (last.y + first.y) / 2, ux = last.x - cx, uy = last.y - cy, rad = hyp(last, first) / 2;
          last.lock = true;
          arc = [{ ...last, sp: first.sp, lock: true }];
          for (let k = 1; k < 12; k++) {
            const th = Math.PI * k / 12;
            arc.push({ x: cx + ux * Math.cos(th) + dx * rad * Math.sin(th), y: cy + uy * Math.cos(th) + dy * rad * Math.sin(th), c: first.c, sp: first.sp, lock: true });
          }
        }
        if (prev.s.leg !== part.s.leg) {
          layers.push(out);
          out = arc.length ? [] : [{ ...last, sp: first.sp, c: first.c }];
        }
      }
      if (arc.length) { out.push(...arc, { ...line[0], lock: true }, ...line.slice(1)); return; }
      const skip = out.length && hyp(out[out.length - 1], line[0]) < .4 ? 1 : 0;
      out.push(...line.slice(skip));
    });
    if (out.length) layers.push(out);
    return layers.map(layer => rounded(layer.map(p => ({ ...p })), zoomRadius));
  }

  /* Colour runs along a layer. Runs too short to read join their longer neighbour, so a layer shows
     clean stretches of colour instead of specks. */
  function colourRuns(pts, minPx) {
    const runs = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const c = pts[k].c, len = hyp(pts[k], pts[k + 1]), last = runs[runs.length - 1];
      if (last && last.c === c) { last.to = k + 1; last.len += len; } else runs.push({ c, from: k, to: k + 1, len });
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let k = 0; k < runs.length; k++) {
        if (runs[k].len >= minPx || runs.length < 2) continue;
        const a = runs[k - 1], b = runs[k + 1], host = !a ? b : !b ? a : a.len >= b.len ? a : b;
        host.from = Math.min(host.from, runs[k].from); host.to = Math.max(host.to, runs[k].to); host.len += runs[k].len;
        runs.splice(k, 1);
        k--;
      }
      for (let k = runs.length - 1; k > 0; k--) {
        if (runs[k].c === runs[k - 1].c) { runs[k - 1].to = runs[k].to; runs[k - 1].len += runs[k].len; runs.splice(k, 1); }
      }
    }
    return runs;
  }

  function stroke(pts, color, w) {
    if (pts.length < 2) return;
    ctx.strokeStyle = color; ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
    ctx.stroke();
  }
  function chevrons(route, pts, lineW, z, baseAlpha) {
    const show = smoothstep(13.9, 14.6, z);
    if (show <= .01) return;
    const metresPerPixel = 40075016.686 * Math.cos(1.29 * Math.PI / 180) / (512 * 2 ** z);
    const ranges = {};
    pts.forEach((p, k) => { const r = ranges[p.sp]; if (r) r[1] = k; else ranges[p.sp] = [k, k]; });
    const size = lineW * .32;
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(1.3, lineW * .2);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (const a of route.anchors) {
      const alpha = show * smoothstep(58, 84, ANCHOR_M * 2 ** a.level / metresPerPixel), range = ranges[a.sp];
      if (alpha <= .01 || !range) continue;
      const m = map.project([a.lng, a.lat]);
      if (m.x < -20 || m.y < -20 || m.x > width + 20 || m.y > height + 20) continue;
      // Sit on the drawn line, which may be a lane or a rounded corner, and follow its direction.
      let best = Infinity, x = 0, y = 0, ux = 0, uy = 0;
      for (let k = range[0]; k < range[1]; k++) {
        const p = pts[k], q = pts[k + 1], dx = q.x - p.x, dy = q.y - p.y, len2 = dx * dx + dy * dy;
        if (!len2) continue;
        const t = clamp(((m.x - p.x) * dx + (m.y - p.y) * dy) / len2, 0, 1), ex = p.x + dx * t - m.x, ey = p.y + dy * t - m.y, d = ex * ex + ey * ey;
        if (d < best) { const len = Math.sqrt(len2); best = d; x = p.x + dx * t; y = p.y + dy * t; ux = dx / len; uy = dy / len; }
      }
      if (best === Infinity) continue;
      ctx.globalAlpha = baseAlpha * alpha;
      ctx.beginPath();
      ctx.moveTo(x - ux * size - uy * size, y - uy * size + ux * size);
      ctx.lineTo(x + ux * size * .5, y + uy * size * .5);
      ctx.lineTo(x - ux * size + uy * size, y - uy * size - ux * size);
      ctx.stroke();
    }
    ctx.globalAlpha = baseAlpha;
  }
  function draw() {
    if (!map || !ctx || !palette) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!selected) return;
    const z = map.getZoom();
    const lineW = z <= 12 ? 3.4 : z >= 18 ? 9 : 3.4 + (z - 12) * .93;
    const radius = lineW * 3;
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    const t = reduced() ? 1 : clamp((performance.now() - fadeFrom) / FADE_MS, 0, 1);
    if (connectors.length) {
      ctx.setLineDash([.1, lineW * .85]);
      ctx.strokeStyle = palette.casing; ctx.lineWidth = Math.max(2.6, lineW * .42);
      for (const [a, b] of connectors) {
        const p = map.project(a), q = map.project(b);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    const baseAlpha = .6 + .4 * t * (2 - t);
    // Later legs lie on top of earlier ones. Each has its own shadow and outline, so overlaps read as layers.
    for (const pts of screenLine(selected, lineW, radius)) {
      if (pts.length < 2) continue;
      ctx.globalAlpha = baseAlpha;
      ctx.lineCap = "round";
      stroke(pts, palette.shadow, lineW + 5.5);
      stroke(pts, palette.casing, lineW + 2.6);
      stroke(pts, palette.cls[2], lineW);
      ctx.lineCap = "butt";
      for (const run of colourRuns(pts, Math.max(16, lineW * 3))) {
        if (run.c !== 2) stroke(pts.slice(run.from, run.to + 1), palette.cls[run.c], lineW);
      }
      chevrons(selected, pts, lineW, z, baseAlpha);
    }
    ctx.lineCap = "round";
    ctx.globalAlpha = 1;
    if (t < 1) map.triggerRepaint();
  }
  function resize() {
    const c = map.getContainer();
    width = c.clientWidth; height = c.clientHeight; ratio = window.devicePixelRatio || 1;
    cv.width = Math.round(width * ratio); cv.height = Math.round(height * ratio);
    cv.style.width = width + "px"; cv.style.height = height + "px";
  }
  return {
    attach(m) {
      map = m;
      cv = document.createElement("canvas");
      cv.setAttribute("aria-hidden", "true");
      cv.style.cssText = "position:absolute;left:0;top:0;pointer-events:none";
      map.getCanvas().after(cv);
      ctx = cv.getContext("2d");
      resize();
      map.on("render", draw);
      map.on("resize", () => { resize(); draw(); });
    },
    setPalette(p) { palette = p; if (map) map.triggerRepaint(); },
    setRoute(r, conn, time) {
      const sig = r ? r.scheme + time + r.legs.flatMap(l => l.s).join() : "";
      if (sig !== selectedSig) { selectedSig = sig; fadeFrom = performance.now(); }
      selected = r ? prepare(r, time) : null;
      connectors = conn;
      if (map) map.triggerRepaint();
    },
  };
})();
