/*
  ShadeWalk route evaluation, AR5958A Group 1 final report
  (Section 5.1, Table 2, Figure 9 and Appendix D).
  Written on 9 Nov 2026 and adapted on 17 Nov 2026 to the published website
  https://zhangyihan-1021.github.io/shadewalk-sg/ , where a route may end at any
  of the 138 exits of 27 stations around the study area.

  WHAT IT DOES
  The script calls the website's own routing function (plan), so the routes are
  the same routes a user would get on the page. No path-finding is rewritten here.
  It produces three things.
    1. Two demo routes from City Hall.
    2. The planning-view figures, namely busy streets with low shade at 13:00.
    3. A test of 300 random itineraries.

  HOW TO RUN
  See README.md in this folder. In short, open the website, press F12, choose the
  Console tab, paste this whole file and press Enter. It takes about two minutes,
  and two result files download at the end.

  HOW THE TEST SAMPLE IS BUILT
  Each draw takes a random start among the 10 MRT stations inside the study area
  and three different stops from the 60 Instagram location tags with the most
  posts in the fixed 90-day window. Stops must be at least 200 m apart. A draw is
  kept only if the shortest route fits the 60-minute walking limit, so the test
  matches how the page is used. The random generator has a fixed seed, so the
  same 300 itineraries come back on every run.

  HOW TO READ THE SHADE NUMBERS
  "shade_pct" is the site's merged shade share (covered paths, then the VLM level,
  then the 3D model where no VLM score exists). "model3d_pct" is the share from the
  3D model only. Each route is scored with the layer that guided it.
*/
(() => {
  'use strict';

  // ---- 1. Settings. Change SEED or TARGET to test a different sample. ----
  const SEED = 595813;
  const TARGET = 300;
  const MAX_DRAWS = 20000;       // safety stop for the sampling loop
  const TOP_PLACES = 60;
  const MIN_SPACING_M = 200;     // same spacing rule as the site's Suggest button
  const WALK_LIMIT_MIN = 60;
  const NOON = 1;                // state.time index for 13:00
  const BALANCED = 1;            // state.w index for the Balanced setting (weight 2.5)
  const LOW_SHADE = 0.33;        // the site's threshold for the low-shade class
  const DEFAULT_STOPS = ['ig:474324149', 'ig:367732531', 'ig:212980037']; // the page's opening stops
  const ROUTE_CODES = { shortest: 'A', linkway: 'B', model3d: 'C', shade: 'D', popular: 'P' };
  // The 10 stations inside the study area, in the order used since the first run on 9 Nov.
  const AREA_STATIONS = ['City Hall', 'Esplanade', 'Raffles Place', 'Clarke Quay', 'Fort Canning',
    'Bras Basah', 'Bencoolen', 'Dhoby Ghaut', 'Bugis', 'Promenade'];

  if (typeof plan !== 'function' || typeof state !== 'object') {
    console.error('Route evaluation needs the ShadeWalk page. Open the website first, then paste this script.');
    return;
  }
  const AREA = AREA_STATIONS.map(n => D.stations.findIndex(s => s.name === n));
  if (AREA.includes(-1)) {
    console.error('A study-area station is missing from the page:', AREA_STATIONS.filter((_, k) => AREA[k] < 0));
    return;
  }

  // Use the page defaults, so the result does not depend on what was clicked before.
  const before = { ...state };
  Object.assign(state, {
    start: AREA[0], startExit: null, endStation: null, endExit: null,
    time: NOON, w: BALANCED, limit: WALK_LIMIT_MIN, scheme: 'D',
    period: 'recent', includeCaptions: true, catalogue: 'instagram', cat: 'all', sort: 'most', search: ''
  });

  // ---- 2. Small helpers ----
  let seed = SEED;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const pick = n => Math.floor(rnd() * n);
  const round = (v, d = 2) => +v.toFixed(d);

  // Nearest-rank quantile, rounded down. The report medians use this definition.
  const quantile = (values, p) => { const s = [...values].sort((a, b) => a - b); return s[Math.floor((s.length - 1) * p)]; };
  const spread = values => ({
    p25: round(quantile(values, 0.25)), median: round(quantile(values, 0.5)), p75: round(quantile(values, 0.75)),
    mean: round(values.reduce((a, b) => a + b, 0) / values.length), n: values.length
  });

  // Metres of route shared by two routes, divided by metres in either route.
  const edgesOf = r => { const m = new Map(); r.legs.forEach(l => l.s.forEach(v => { const i = Math.abs(v) - 1; m.set(i, D.segs[i][1]); })); return m; };
  const overlap = (a, b) => {
    const A = edgesOf(a), B = edgesOf(b); let shared = 0, either = 0;
    A.forEach((L, i) => { either += L; if (B.has(i)) shared += L; });
    B.forEach((L, i) => { if (!A.has(i)) either += L; });
    return either ? shared / either : 1;
  };

  // Share of route length on covered paths.
  const coveredShare = r => { let c = 0, L = 0; r.legs.forEach(l => l.s.forEach(v => { const g = D.segs[Math.abs(v) - 1]; c += g[2]; L += g[1]; })); return L ? c / L : 0; };

  // Longest run of consecutive low-shade segments, counted the same way as the page.
  const longestExposed = r => {
    const t = state.time; let run = 0, cur = [], best = 0, bestSegs = [];
    r.legs.forEach(l => l.s.forEach(v => {
      const i = Math.abs(v) - 1, g = D.segs[i];
      if (shadeClass(g, t) === 0) { run += g[1] - g[12][t]; cur.push(i); if (run > best) { best = run; bestSegs = cur.slice(); } }
      else { run = 0; cur = []; }
    }));
    return { best, bestSegs };
  };

  const brief = r => ({
    km: round(r.L / 1000), minutes: r.mins, shade_pct: round(r.share * 100, 1), model3d_pct: round(r.modelShare * 100, 1),
    svi_coverage_pct: round(r.coverage * 100, 1), longest_exposed_m: Math.round(r.maxRun), posts_along_route: r.posts.total,
    end_station: D.stations[r.end].name, order: r.order.map(i => D.pois[i].en)
  });
  const demoRoutes = sel => Object.fromEntries(Object.entries(ROUTE_CODES).map(([name, code]) => [name, brief(plan(code, sel))]));

  // ---- 3. Demo routes from City Hall. The stop choice mirrors suggestPopularStops in popularity-ui.js. ----
  const suggestStops = () => {
    const candidates = visiblePlaces().filter(x => x.total > 0 && x.p.routable).slice(0, 80), chosen = [];
    for (const { i, p } of candidates) {
      if (chosen.length === 3) break;
      if (chosen.some(j => placeDistance(p, D.pois[j]) < MIN_SPACING_M)) continue;
      const trial = plan(state.scheme, [...chosen, i]);
      if (trial && trial.L / WALK <= state.limit) chosen.push(i);
    }
    return chosen;
  };
  const defaultStops = DEFAULT_STOPS.map(id => D.pois.findIndex(p => p.id === id));
  const suggested = suggestStops();
  const demo = {
    start_station: D.stations[state.start].name, time: '13:00', detour_setting: 'Balanced', walking_limit_min: state.limit,
    opening_stops: { stops: defaultStops.map(i => ({ name: D.pois[i].en, posts_90_days: popularity(i).total })), routes: demoRoutes(defaultStops) },
    suggested_stops: { stops: suggested.map(i => ({ name: D.pois[i].en, posts_90_days: popularity(i).total })), routes: demoRoutes(suggested) }
  };

  // ---- 4. Planning view (report Section 5.4). Streets with many nearby posts and low shade at 13:00. ----
  const planningView = () => {
    updatePopular();
    const totals = D.pois.map((_, i) => popularity(i).total);
    const nearby = D.segs.map(g => g[13].reduce((n, i) => n + totals[i], 0));
    const positive = nearby.filter(v => v > 0).sort((a, b) => a - b);
    const cut = positive[Math.floor(positive.length * 0.9)];
    let network = 0, lowAll = 0, nearAny = 0, top = 0, topLow = 0;
    const flagged = [];
    D.segs.forEach((g, i) => {
      const L = g[1]; network += L; if (!L) return;
      const share = g[12][NOON] / L;
      if (share < LOW_SHADE) lowAll += L;
      if (nearby[i] > 0) nearAny += L;
      if (nearby[i] > 0 && nearby[i] >= cut) {
        top += L;
        if (share < LOW_SHADE) {
          topLow += L;
          if (L >= 20) flagged.push({ segment_id: g[8], length_m: Math.round(L), nearby_posts: nearby[i], shade_pct: Math.round(share * 100), svi_coverage_pct: Math.round(g[10] / L * 100) });
        }
      }
    });
    flagged.sort((a, b) => b.nearby_posts * b.length_m - a.nearby_posts * a.length_m);
    return {
      definition: 'Nearby posts are sampled 90-day posts of places within 60 m of a segment. Top group is the top 10% of segments with any nearby post. Low shade is under 33% at 13:00.',
      network_km: round(network / 1000, 1), low_shade_km: round(lowAll / 1000, 1), near_any_post_km: round(nearAny / 1000, 1),
      top_group_min_nearby_posts: cut, top_group_km: round(top / 1000, 1), top_group_low_shade_km: round(topLow / 1000, 1), flagged_segments: flagged
    };
  };
  const planning = planningView();

  // ---- 5. The itinerary test (report Section 5.1) ----
  const top = visiblePlaces().filter(x => x.total > 0 && x.p.routable).slice(0, TOP_PLACES).map(x => x.i);
  const metrics = {}, rows = [];
  const add = (key, value) => (metrics[key] = metrics[key] || []).push(value);
  const counts = {
    identical_shade_and_model3d: 0, identical_shade_and_shortest: 0, identical_model3d_and_shortest: 0,
    order_differs_shade_vs_shortest: 0, end_station_differs_shade_vs_shortest: 0, shade_route_over_limit: 0,
    shortest_with_exposed_100m_plus: 0, shade_with_exposed_100m_plus: 0
  };
  let drawn = 0, kept = 0;

  const drawOne = () => {
    const start = AREA[pick(AREA.length)], sel = [];
    while (sel.length < 3) {
      const c = top[pick(top.length)];
      if (!sel.includes(c) && sel.every(j => placeDistance(D.pois[c], D.pois[j]) >= MIN_SPACING_M)) sel.push(c);
    }
    state.start = start; state.time = NOON; state.w = BALANCED; drawn++;

    const shortest = plan('A', sel);
    if (shortest.mins > WALK_LIMIT_MIN) return;
    const model3d = plan('C', sel), shade = plan('D', sel), linkway = plan('B', sel), popular = plan('P', sel);
    kept++;

    // Levels of each route on its own
    add('shortest_km', shortest.L / 1000); add('shortest_minutes', shortest.mins); add('shortest_shade_pct', shortest.share * 100);
    add('shortest_model3d_pct', shortest.modelShare * 100); add('shortest_longest_exposed_m', shortest.maxRun); add('shortest_svi_coverage_pct', shortest.coverage * 100);
    add('shade_km', shade.L / 1000); add('shade_minutes', shade.mins); add('shade_shade_pct', shade.share * 100);
    add('shade_model3d_pct', shade.modelShare * 100); add('shade_longest_exposed_m', shade.maxRun); add('shade_svi_coverage_pct', shade.coverage * 100);
    add('model3d_km', model3d.L / 1000); add('model3d_shade_pct', model3d.share * 100); add('model3d_model3d_pct', model3d.modelShare * 100); add('model3d_longest_exposed_m', model3d.maxRun);

    // Differences from the shortest route
    add('shade_vs_shortest_extra_m', shade.L - shortest.L); add('shade_vs_shortest_extra_pct', (shade.L - shortest.L) / shortest.L * 100);
    add('shade_vs_shortest_shade_points', (shade.share - shortest.share) * 100); add('shade_vs_shortest_model3d_points', (shade.modelShare - shortest.modelShare) * 100);
    add('shade_vs_shortest_exposed_m', shade.maxRun - shortest.maxRun); add('shade_vs_shortest_posts', shade.posts.total - shortest.posts.total);
    add('model3d_vs_shortest_extra_m', model3d.L - shortest.L); add('model3d_vs_shortest_shade_points', (model3d.share - shortest.share) * 100); add('model3d_vs_shortest_model3d_points', (model3d.modelShare - shortest.modelShare) * 100);
    add('linkway_vs_shortest_extra_m', linkway.L - shortest.L); add('linkway_vs_shortest_shade_points', (linkway.share - shortest.share) * 100); add('linkway_vs_shortest_covered_points', (coveredShare(linkway) - coveredShare(shortest)) * 100);
    add('popular_vs_shortest_extra_m', popular.L - shortest.L); add('popular_vs_shortest_shade_points', (popular.share - shortest.share) * 100); add('popular_vs_shortest_posts', popular.posts.total - shortest.posts.total);

    // VLM-led route against the 3D-led route
    add('shade_vs_model3d_shade_points', (shade.share - model3d.share) * 100); add('model3d_vs_shade_model3d_points', (model3d.modelShare - shade.modelShare) * 100);
    if (shortest.level != null && model3d.level != null && shade.level != null) {
      add('shortest_mean_vlm_level', shortest.level); add('model3d_mean_vlm_level', model3d.level); add('shade_mean_vlm_level', shade.level);
      add('shade_vs_shortest_vlm_level', shade.level - shortest.level); add('model3d_vs_shortest_vlm_level', model3d.level - shortest.level);
    }
    const ovShade3d = overlap(shade, model3d), ovShadeShort = overlap(shade, shortest), ov3dShort = overlap(model3d, shortest);
    add('overlap_shade_model3d_pct', ovShade3d * 100); add('overlap_shade_shortest_pct', ovShadeShort * 100); add('overlap_model3d_shortest_pct', ov3dShort * 100);
    if (ovShade3d > 0.999) counts.identical_shade_and_model3d++;
    if (ovShadeShort > 0.999) counts.identical_shade_and_shortest++;
    if (ov3dShort > 0.999) counts.identical_model3d_and_shortest++;
    if (shade.order.join() !== shortest.order.join()) counts.order_differs_shade_vs_shortest++;
    if (shade.end !== shortest.end) counts.end_station_differs_shade_vs_shortest++;
    if (shade.mins > WALK_LIMIT_MIN) counts.shade_route_over_limit++;
    if (longestExposed(shortest).best >= 100) counts.shortest_with_exposed_100m_plus++;
    if (longestExposed(shade).best >= 100) counts.shade_with_exposed_100m_plus++;

    // Detour settings (report Table 2). Balanced is the shade route above.
    add('detour_balanced_extra_m', shade.L - shortest.L); add('detour_balanced_shade_points', (shade.share - shortest.share) * 100); add('detour_balanced_km', shade.L / 1000); add('detour_balanced_shade_pct', shade.share * 100); add('detour_balanced_exposed_m', shade.maxRun);
    [['shorter', 0], ['ok', 2]].forEach(([name, w]) => {
      state.w = w; const x = plan('D', sel);
      add(`detour_${name}_extra_m`, x.L - shortest.L); add(`detour_${name}_shade_points`, (x.share - shortest.share) * 100); add(`detour_${name}_km`, x.L / 1000); add(`detour_${name}_shade_pct`, x.share * 100); add(`detour_${name}_exposed_m`, x.maxRun);
    });
    state.w = BALANCED;

    // Start time (report Section 5.1). How much of the 13:00 route is kept at 9:00 and 17:00.
    [['0900', 0], ['1700', 2]].forEach(([name, t]) => {
      state.time = t; const x = plan('D', sel), y = plan('C', sel);
      add(`time_${name}_overlap_shade_pct`, overlap(x, shade) * 100); add(`time_${name}_overlap_model3d_pct`, overlap(y, model3d) * 100);
    });
    state.time = NOON;

    rows.push({
      itinerary: kept, start_station: D.stations[start].name, stop_1: D.pois[sel[0]].en, stop_2: D.pois[sel[1]].en, stop_3: D.pois[sel[2]].en,
      shortest_km: round(shortest.L / 1000), shortest_minutes: shortest.mins, shortest_shade_pct: round(shortest.share * 100, 1), shortest_longest_exposed_m: Math.round(shortest.maxRun), shortest_end_station: D.stations[shortest.end].name, shortest_posts: shortest.posts.total,
      shade_km: round(shade.L / 1000), shade_minutes: shade.mins, shade_shade_pct: round(shade.share * 100, 1), shade_longest_exposed_m: Math.round(shade.maxRun), shade_end_station: D.stations[shade.end].name,
      model3d_km: round(model3d.L / 1000), model3d_shade_pct: round(model3d.share * 100, 1),
      linkway_km: round(linkway.L / 1000), linkway_shade_pct: round(linkway.share * 100, 1),
      popular_km: round(popular.L / 1000), popular_shade_pct: round(popular.share * 100, 1), popular_posts: popular.posts.total,
      overlap_shade_model3d_pct: round(ovShade3d * 100, 1), overlap_shade_shortest_pct: round(ovShadeShort * 100, 1)
    });
  };

  // ---- 6. Save the results ----
  const csvCell = v => { const s = String(v); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const saveFile = (name, text, type) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  const finish = () => {
    Object.assign(state, before);
    const summary = Object.fromEntries(Object.keys(metrics).sort().map(k => [k, spread(metrics[k])]));
    const result = {
      meta: {
        generated_at: new Date().toISOString(), source: 'ShadeWalk website as published on GitHub Pages, site files dated 12 Nov 2026',
        seed: SEED, itineraries_kept: kept, draws_needed: drawn, start_stations: AREA_STATIONS,
        end_choice: `lowest-cost exit among ${D.exits.length} exits of ${D.stations.length} stations`,
        top_places: TOP_PLACES, min_spacing_m: MIN_SPACING_M, walking_limit_min: WALK_LIMIT_MIN,
        time: '13:00', detour_setting: 'Balanced unless a metric says otherwise', post_period: '2026-08-06 to 2026-11-03', quantile_rule: 'nearest rank, rounded down'
      },
      demo, planning_view: planning, counts, summary
    };
    const columns = Object.keys(rows[0]);
    const csv = '﻿' + [columns.join(','), ...rows.map(r => columns.map(c => csvCell(r[c])).join(','))].join('\r\n') + '\r\n';
    const json = JSON.stringify(result, null, 2) + '\n';
    window.__routeEval = { result, json, csv };
    console.log('Route evaluation finished. Full result is in window.__routeEval.result', result);
    if (!window.ROUTE_EVAL_SKIP_DOWNLOAD) {
      saveFile('route_evaluation_results.json', json, 'application/json');
      saveFile('route_evaluation_itineraries.csv', csv, 'text/csv;charset=utf-8');
    }
  };

  // Work in short slices so the page stays responsive.
  const step = () => {
    try {
      const t = performance.now();
      while (kept < TARGET && drawn < MAX_DRAWS && performance.now() - t < 1500) drawOne();
      console.log(`Route evaluation, ${kept} of ${TARGET} itineraries kept`);
      if (kept < TARGET && drawn < MAX_DRAWS) setTimeout(step, 0); else finish();
    } catch (e) {
      Object.assign(state, before);
      window.__routeEval = { error: String(e) };
      console.error('Route evaluation stopped', e);
    }
  };
  window.__routeEval = { running: true };
  console.log('Route evaluation started. Keep this tab open for about two minutes.');
  setTimeout(step, 0);
})();
