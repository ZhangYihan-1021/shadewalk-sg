/* Shade map drawn as flowing streaks along every street, like a wind-flow plot: blue where the street is
   shaded and cool, red where it is exposed. Colour comes from the merged shade (mainly SVI) for the selected
   time. The motion is decorative, not a modelled air flow. Only on-screen streets are drawn each frame. */
const FlowOverlay = (() => {
  const BINS = 14, SPACING = 34, FADE_MS = 450;
  const COLORS = Array.from({ length: BINS }, (_, k) => {
    const v = k / (BINS - 1);
    return `hsl(${Math.round(228 - 228 * v)}, 90%, ${Math.round(47 + 7 * Math.sin(v * Math.PI))}%)`;
  });
  let map = null, cv = null, ctx = null, width = 0, height = 0, ratio = 1;
  let segs = null, time = 1, on = false, changedAt = 0, raf = 0;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  function prepare() {
    segs = [];
    D.segs.forEach((g, i) => {
      let c = segCoords(i);
      if (c.length < 2) return;
      // Point most streets the same general way so neighbouring streaks flow together.
      const a = c[0], b = c[c.length - 1];
      if ((b[0] - a[0]) + .35 * (b[1] - a[1]) < 0) c = c.slice().reverse();
      const m = new Float64Array(c.length * 2);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      c.forEach((p, k) => {
        const mc = maplibregl.MercatorCoordinate.fromLngLat(p);
        m[2 * k] = mc.x; m[2 * k + 1] = mc.y;
        x0 = Math.min(x0, mc.x); y0 = Math.min(y0, mc.y); x1 = Math.max(x1, mc.x); y1 = Math.max(y1, mc.y);
      });
      // Sheltered ways with no street view are mostly indoor corridors: one quiet line instead of a bundle.
      const indoor = g[1] > 0 && g[2] / g[1] > .5 && !g[10];
      segs.push({ i, ll: c, m, bb: [x0, y0, x1, y1], h: ((i * 2654435761) % 1000) / 1000, bin: 0, speed: 20, indoor });
    });
    colour();
  }
  function colour() {
    if (!segs) return;
    for (const s of segs) {
      const g = D.segs[s.i], exposure = g[1] ? clamp(1 - g[12][time] / g[1], 0, 1) : 0;
      s.bin = Math.round(exposure * (BINS - 1));
      s.speed = 12 + 22 * exposure;
    }
  }
  /* Mercator to screen is affine while the map is flat, so three projections cover every point. */
  function affine() {
    const c = map.getCenter(), m0 = maplibregl.MercatorCoordinate.fromLngLat(c), d = 1e-4;
    const at = (x, y) => map.project(new maplibregl.MercatorCoordinate(x, y).toLngLat());
    const p0 = map.project(c), p1 = at(m0.x + d, m0.y), p2 = at(m0.x, m0.y + d);
    const a = (p1.x - p0.x) / d, b = (p2.x - p0.x) / d, cc = (p1.y - p0.y) / d, dd = (p2.y - p0.y) / d;
    return { a, b, c: cc, d: dd, e: p0.x - a * m0.x - b * m0.y, f: p0.y - cc * m0.x - dd * m0.y };
  }
  function draw(now) {
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const since = now - changedAt, fade = on ? smooth(0, FADE_MS, since) : 1 - smooth(0, FADE_MS * .6, since);
    if (fade <= .001 || !segs) return false;
    const z = map.getZoom(), flat = map.getPitch() < .5, T = flat ? affine() : null;
    // Streets become bundles of 1, 3 or 5 parallel streamlines as you zoom in.
    const gap = clamp(1.7 * 2 ** (z - 15), 1.3, 4.6), lanesAt = z >= 16.4 ? 2 : z >= 14.7 ? 1 : 0;
    const comet = smooth(13.8, 14.8, z), cometLen = clamp(5 * 2 ** ((z - 15) * .6), 5, 15), t = reduced() ? 0 : now / 1000;
    const lines = COLORS.map(() => new Path2D()), tails = COLORS.map(() => new Path2D()), heads = COLORS.map(() => new Path2D());
    const margin = 30;
    for (const s of segs) {
      let pts;
      if (T) {
        const [x0, y0, x1, y1] = s.bb;
        const xs = [T.a * x0 + T.b * y0, T.a * x1 + T.b * y0, T.a * x0 + T.b * y1, T.a * x1 + T.b * y1].map(v => v + T.e);
        const ys = [T.c * x0 + T.d * y0, T.c * x1 + T.d * y0, T.c * x0 + T.d * y1, T.c * x1 + T.d * y1].map(v => v + T.f);
        if (Math.max(...xs) < -margin || Math.min(...xs) > width + margin || Math.max(...ys) < -margin || Math.min(...ys) > height + margin) continue;
        pts = [];
        for (let k = 0; k < s.m.length; k += 2) pts.push(T.a * s.m[k] + T.b * s.m[k + 1] + T.e, T.c * s.m[k] + T.d * s.m[k + 1] + T.f);
      } else {
        pts = [];
        let inside = false;
        for (const p of s.ll) { const q = map.project(p); pts.push(q.x, q.y); if (q.x > -margin && q.x < width + margin && q.y > -margin && q.y < height + margin) inside = true; }
        if (!inside) continue;
      }
      // Pieces of the polyline: start, direction, normal at each end, running length.
      const pieces = [];
      let total = 0;
      for (let k = 2; k < pts.length; k += 2) {
        const dx = pts[k] - pts[k - 2], dy = pts[k + 1] - pts[k - 1], len = Math.hypot(dx, dy);
        if (len > .01) { pieces.push([pts[k - 2], pts[k - 1], dx / len, dy / len, total, len]); total += len; }
      }
      if (total < 1.5) continue;
      const lanes = s.indoor ? 0 : lanesAt;
      // Vertex normals averaged between neighbouring pieces so offset streamlines stay joined at bends.
      const nv = [];
      for (let k = 0; k <= pieces.length; k++) {
        const a = pieces[Math.max(0, k - 1)], b = pieces[Math.min(pieces.length - 1, k)];
        let nx = -(a[3] + b[3]), ny = a[2] + b[2];
        const l = Math.hypot(nx, ny) || 1, cos = Math.max(.5, (nx / l) * -b[3] + (ny / l) * b[2]);
        nv.push([nx / l / cos, ny / l / cos]);
      }
      const path = lines[s.bin];
      for (let ln = -lanes; ln <= lanes; ln++) {
        const o = ln * gap;
        path.moveTo(pieces[0][0] + nv[0][0] * o, pieces[0][1] + nv[0][1] * o);
        pieces.forEach((p, k) => path.lineTo(p[0] + p[2] * p[5] + nv[k + 1][0] * o, p[1] + p[3] * p[5] + nv[k + 1][1] * o));
      }
      if (comet <= .01 || total < 8) continue;
      const tail = tails[s.bin], head = heads[s.bin];
      for (let ln = -lanes; ln <= lanes; ln++) {
        let pos = ((t * s.speed * (1 + .12 * ln * ln) + s.h * SPACING + ln * SPACING * .41) % SPACING + SPACING) % SPACING - cometLen, pi = 0;
        while (pos < total) {
          const a = Math.max(0, pos), b = Math.min(total, pos + cometLen);
          if (b - a > 1) {
            const at = d => {
              while (pi < pieces.length - 1 && pieces[pi][4] + pieces[pi][5] < d) pi++;
              while (pi > 0 && pieces[pi][4] > d) pi--;
              const [x, y, ux, uy, start] = pieces[pi], u = d - start;
              return [x + ux * u - uy * ln * gap, y + uy * u + ux * ln * gap];
            };
            const p0 = at(a), pm = at(Math.max(a, b - cometLen * .35)), p1 = at(b);
            tail.moveTo(p0[0], p0[1]); tail.lineTo(pm[0], pm[1]);
            head.moveTo(pm[0], pm[1]); head.lineTo(p1[0], p1[1]);
          }
          pos += SPACING;
        }
      }
    }
    ctx.lineJoin = "round";
    const thin = clamp(.7 + .25 * (z - 14), .7, 1.3);
    // Hot streets glow softly, like the red cores in a wind-flow plot.
    ctx.lineCap = "round";
    for (let k = Math.ceil(BINS * .6); k < BINS; k++) {
      ctx.globalAlpha = .1 * fade * (k / (BINS - 1));
      ctx.lineWidth = gap * (2 * lanesAt + 1) + 6;
      ctx.strokeStyle = COLORS[k]; ctx.stroke(lines[k]);
    }
    ctx.lineCap = "butt";
    ctx.lineWidth = lanesAt ? thin : clamp(.9 + .4 * (z - 13), .9, 1.5);
    lines.forEach((p, k) => { ctx.globalAlpha = fade * (lanesAt ? .3 + .3 * k / (BINS - 1) : .55 + .35 * k / (BINS - 1)); ctx.strokeStyle = COLORS[k]; ctx.stroke(p); });
    if (comet > .01) {
      ctx.lineCap = "round";
      ctx.lineWidth = thin * 1.5;
      ctx.globalAlpha = .45 * fade * comet;
      tails.forEach((p, k) => { ctx.strokeStyle = COLORS[k]; ctx.stroke(p); });
      ctx.lineWidth = thin * 2;
      ctx.globalAlpha = fade * comet;
      heads.forEach((p, k) => { ctx.strokeStyle = COLORS[k]; ctx.stroke(p); });
    }
    ctx.globalAlpha = 1;
    return on || fade > .001;
  }
  function loop(now) {
    raf = 0;
    const keep = draw(now);
    if (keep && (on && !reduced() || now - changedAt < FADE_MS)) raf = requestAnimationFrame(loop);
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
      map.on("render", () => { if (on || performance.now() - changedAt < FADE_MS) draw(performance.now()); });
      map.on("resize", () => { resize(); draw(performance.now()); });
    },
    set(active, t) {
      if (t !== time) { time = t; colour(); }
      if (active !== on) {
        on = active;
        changedAt = performance.now();
        if (on && !segs) prepare();
      }
      if (!raf) raf = requestAnimationFrame(loop);
    },
    colours: COLORS,
  };
})();
