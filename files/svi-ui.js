/* Merged shade: street-view scores first, joined by SEGMENT_ID. Length without a score falls back to
   the 3D model for the selected time of day. Covered paths count as fully shaded. */
function installSvi(D) {
  const S = window.SVI_DATA;
  D.segs.forEach(g => {
    const x = S.scores[g[8]], L = g[1], cov = x ? Math.min(x[0], L) : 0, lev = x ? x[1] : null;
    g[10] = cov; g[11] = lev;
    g[12] = g[5].map(model => {
      if (!L) return 0;
      const f = (cov * (lev || 0) / 3 + (L - cov) * model / L) / L;
      return Math.min(L, g[2] + (L - g[2]) * f);
    });
  });
}
function shadeClass(g, t) {
  const r = g[1] ? g[12][t] / g[1] : 0;
  return r >= .67 ? 2 : r >= .33 ? 1 : 0;
}
function routeMeasure(legs) {
  const t = state.time;
  let L = 0, shade = 0, model = 0, cov = 0, sum = 0, hi = 0, mi = 0, lo = 0, run = 0, maxRun = 0, extra = 0;
  legs.forEach(l => {
    let lm = 0, ls = 0;
    l.s.forEach(v => {
      const g = D.segs[Math.abs(v) - 1], len = g[1], s = g[12][t], c = shadeClass(g, t);
      lm += len; ls += s; model += g[5][t];
      if (g[10]) { cov += g[10]; sum += g[10] * g[11]; }
      if (c === 2) hi += len; else if (c === 1) mi += len; else lo += len;
      if (c === 0) { run += len - s; maxRun = Math.max(maxRun, run); } else run = 0;
    });
    l.m = lm; l.sh = ls; L += lm; shade += ls;
    const stop = n => n[0] === "p" ? D.pois[+n.slice(1)].snap : 0;
    extra += stop(l.from) + stop(l.to);
    if (l.exit != null) extra += D.exits[l.exit].snap;
  });
  const total = L + extra;
  return { L: total, netL: L, share: L ? shade / L : 0, modelShare: L ? model / L : 0, coverage: L ? cov / L : 0, level: cov ? sum / cov : null, hi, mi, lo, maxRun, mins: Math.round(total / WALK) };
}
function sviFindings() {
  const s = window.SVI_DATA.summary, a = s.agreement;
  return `<section class="group"><h3>${T("sviFindTitle")}</h3>
    <p class="note">${T("sviFindLead")(s.spearman.model13, s.ratioSpearman.sky, s.ratioSpearman.tree)}</p>
    <div class="metrics tn"><div><b>${a.sviHighModelLow13} km</b><span>${T("sviHighModelLow")}</span></div><div><b>${a.sviLowModelHigh13} km</b><span>${T("sviLowModelHigh")}</span></div><div><b>${a.sviHighNoTreeNoShelter} km</b><span>${T("sviNoLayer")}</span></div></div>
    <p class="note">${T("sviFindNote")(a.comparedKm)}</p></section>`;
}
function sviDataNotes() {
  const s = window.SVI_DATA.summary;
  return `<section class="group"><h3>${T("sviDataTitle")}</h3><p class="note">${T("sviDataNote")(s)}</p>
    <div class="metrics tn"><div><b>${s.pointsScored.toLocaleString()}</b><span>${T("sviPoints")}</span></div><div><b>${Math.round(s.coverage * 100)}%</b><span>${T("sviCoverNet")}</span></div><div><b>${s.meanLevel.toFixed(1)} / 3</b><span>${T("sviMean")}</span></div></div></section>`;
}
function installSviText(I18N) {
  Object.assign(I18N.zh, {
    sub: "遮阴步行路线", ph: "搜索地点，或输入“中午少晒太阳”", tabCompare: "比较", tabPlan: "规划",
    D: "遮阴路线", Dd: "以 SVI 街景为主", P: "热门路线", Pd: "多走发帖活跃的街道", B: "连廊路线", Bd: "优先走有盖路段", A: "最短路线", Ad: "只看距离", C: "3D 模型基线",
    shadeWord: "遮阴", postsWord: "帖", badgeShort: "最短", badgeShade: "最阴凉", badgePop: "帖子最多",
    addPlaces: "添加地点", back: "路线", autoExit: "自动选择", detailLegs: "每段路程", along: "沿途热门地点", alongNote: "60 米内的 Instagram 样本帖子，不是实际客流。", less: "少绕路", bal: "平衡", shady: "多绕也行", sviCover: "SVI 覆盖", sviCoverNet: "路网覆盖", exposed: "最长暴晒", modelCol: "3D 模型", shadeCol: "遮阴", postsCol: "帖子",
    high: "高", mid: "中", low: "低", shadeLevels: "遮阴程度", legendHigh: "遮阴高", legendMid: "中", legendLow: "低",
    legFmt: (m, t, s) => `${m} 米 · ${t} 分钟 · 遮阴 ${s}%`, overLimit: m => `比步行上限多约 ${m} 分钟`, timeLabel: "出发时间", limitLabel: "步行上限", tradeLabel: "绕路程度",
    routesTitle: "推荐路线", sampleNote: "帖子数是采集样本，不是实际客流。", popPeriod: "发帖时段", recommendBtn: "按热度推荐 3 个", clearStops: "清空", selectedCount: (n) => `已选 ${n}/6`, sviPoints: "有效评分点", sviMean: "平均等级", sviDataTitle: "遮阴数据（SVI）",
    cmpLeadD: (dm, a, b) => `遮阴路线比最短路线${dm >= 0 ? "多走" : "少走"} <b class="tn">${Math.abs(dm)} 米</b>，遮阴从 <b class="tn">${a}%</b> 变为 <b class="tn">${b}%</b>。`,
    cmpLeadP: (dm, a, b) => `热门路线${dm >= 0 ? "多走" : "少走"} <b class="tn">${Math.abs(dm)} 米</b>，沿途样本帖子从 <b class="tn">${a}</b> 条变为 <b class="tn">${b}</b> 条。`,
    cmpNote: "“遮阴”以 SVI 街景为主，缺失处用 3D 模型；“3D 模型”是不用街景的基线。都还没有实地核查，所以这里只能说明路线差异，不能说明哪种方法更准。", sens: "绕路程度的影响（遮阴路线）", svi: "下一步：用实地核查比较 3D 模型和 SVI，优先抽查上面两者不一致的路段。",
    sviFindTitle: "SVI 和 3D 模型有什么不同", sviFindLead: (m, sky, tree) => `两者的路段相关性很低（Spearman ${m}），说明它们不是同一种信息。SVI 等级和图像中的天空比例明显负相关（${sky}），和树的比例弱正相关（${tree}）。`,
    sviHighModelLow: "SVI 高，模型低", sviLowModelHigh: "SVI 低，模型高", sviNoLayer: "SVI 高，但无树无连廊", sviFindNote: km => `基于 ${km} 公里可比路段，模型按 13:00 计算。街景只是某一时刻的快照，模型又受数据精度影响，目前不能判断谁对谁错，这些路段最值得实地核查。`,
    sviFuture: "", sviDataNote: s => `SVI 只作为算路的数据来源，不在地图上显示。${s.points.toLocaleString()} 个街景点中，${s.pointsScored.toLocaleString()} 个在研究区附近且有有效评分。路网每 5 米取 ${s.matchMetres} 米内最近的评分点，室内和隧道路段不使用街景。每段路的遮阴 = 有盖部分算 100%，其余按“等级 ÷ 3”，没有 SVI 的部分用所选时段的 3D 模型。这种换算只是原型假设。车载街景看不到连廊下的情况。街景影像 ${Math.round(s.imageYears.from2024 * 100)}% 拍于 2024 年及以后，${Math.round(s.imageYears.before2020 * 100)}% 早于 2020 年。`,
    popRouteNote: "热门路线和其他路线走相同的景点，但优先经过 60 米内发帖较多的街道。街道权重只用于算路，页面只显示帖子数。搜索框里的需求按关键词解析，尚未连接 AI 模型。",
  });
  Object.assign(I18N.en, {
    sub: "Shaded walking routes", ph: "Search places, or try “less sun at noon”", tabCompare: "Compare", tabPlan: "Planning",
    D: "Shade route", Dd: "Mainly street-view SVI", P: "Popular route", Pd: "Streets with more posts", B: "Linkway route", Bd: "Prefers covered paths", A: "Shortest route", Ad: "Distance only", C: "3D model baseline",
    shadeWord: "shade", postsWord: "posts", badgeShort: "Shortest", badgeShade: "Shadiest", badgePop: "Most posts",
    addPlaces: "Add places", back: "Route", autoExit: "Chosen automatically", detailLegs: "Each leg", along: "Popular along the way", alongNote: "Sampled Instagram posts within 60 m, not visitor numbers.", less: "Shorter", bal: "Balanced", shady: "Detours OK", sviCover: "SVI coverage", sviCoverNet: "Network coverage", exposed: "Longest in sun", modelCol: "3D model", shadeCol: "Shade", postsCol: "Posts",
    high: "High", mid: "Medium", low: "Low", shadeLevels: "Shade", legendHigh: "High shade", legendMid: "Medium", legendLow: "Low",
    legFmt: (m, t, s) => `${m} m · ${t} min · ${s}% shade`, overLimit: m => `About ${m} min over your limit`, timeLabel: "Start time", limitLabel: "Walking limit", tradeLabel: "Detours",
    routesTitle: "Suggested routes", sampleNote: "Post counts are a sample, not visitor numbers.", popPeriod: "Post period", recommendBtn: "Suggest 3 popular places", clearStops: "Clear", selectedCount: (n) => `${n}/6 selected`, sviPoints: "Scored points", sviMean: "Mean level", sviDataTitle: "Shade data (SVI)",
    cmpLeadD: (dm, a, b) => `The shade route is <b class="tn">${Math.abs(dm)} m ${dm >= 0 ? "longer" : "shorter"}</b> than the shortest route, and shade moves from <b class="tn">${a}%</b> to <b class="tn">${b}%</b>.`,
    cmpLeadP: (dm, a, b) => `The popular route is <b class="tn">${Math.abs(dm)} m ${dm >= 0 ? "longer" : "shorter"}</b>, and sampled posts along the way move from <b class="tn">${a}</b> to <b class="tn">${b}</b>.`,
    cmpNote: "Shade is mainly street-view SVI, with the 3D model where SVI is missing. The 3D model row is the baseline without street view. Nothing has been field-checked, so this shows how routes differ, not which method is more accurate.", sens: "Effect of the detour setting (shade route)", svi: "Next step: use field checks to compare the 3D model and SVI, starting with the streets where they disagree above.",
    sviFindTitle: "How SVI differs from the 3D model", sviFindLead: (m, sky, tree) => `They correlate weakly across street segments (Spearman ${m}), so they are not the same information. SVI level falls clearly as visible sky rises (${sky}) and rises slightly with visible trees (${tree}).`,
    sviHighModelLow: "SVI high, model low", sviLowModelHigh: "SVI low, model high", sviNoLayer: "SVI high, no trees or linkways", sviFindNote: km => `Based on ${km} km of comparable segments, with the model at 13:00. Street view is a snapshot of one moment and the model depends on its data, so we cannot yet say which is right. These streets are the most useful to field-check.`,
    sviFuture: "", sviDataNote: s => `SVI is used for routing only and is not drawn on the map. Of ${s.points.toLocaleString()} street-view points, ${s.pointsScored.toLocaleString()} are near the study area with a valid score. Every 5 m of network takes the nearest scored point within ${s.matchMetres} m, and indoor and tunnel segments do not use street view. Segment shade counts covered paths as 100%, other paths as level ÷ 3, and uses the 3D model for the selected time where SVI is missing. This conversion is a prototype assumption. Car-mounted street view cannot see under linkways. ${Math.round(s.imageYears.from2024 * 100)}% of images date from 2024 or later and ${Math.round(s.imageYears.before2020 * 100)}% from before 2020.`,
    popRouteNote: "The popular route visits the same places as the others but prefers streets with more posts within 60 m. The street weight is only used for routing, and the page only shows post counts. Requests typed in the search box are read by keyword and are not connected to an AI model yet.",
  });
  for (const lang of ["zh", "en"]) {
    const row = I18N[lang].srcs.find(r => r[0] === (lang === "zh" ? "街景遮阴分数（SVI）" : "Street-view shade scores (SVI)"));
    if (row) row.splice(1, 2, lang === "zh" ? "街景 AI 评级和图像分割，已接入，尚未实地核查" : "AI ratings and image segmentation; connected, not yet field-checked", "part");
  }
}
