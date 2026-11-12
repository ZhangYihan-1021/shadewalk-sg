/* Map styles: standard, shade (streets drawn as flowing streaks coloured by cooling, see flow.js) and
   popularity (a soft heat map of sampled Instagram posts). Both analysis styles switch the base map to a
   quiet white line drawing so the data reads first. */
const MAP_MODES = ["standard", "shade", "heat"];
const ARCH = {
  light: { bg: "#f4f4f2", green: "#eef1eb", water: "#e2eaee", major: "#ffffff", majorC: "#d9d9d5", minor: "#ffffff", minorC: "#e4e4e0", foot: "#d2d2ce", ctx: "#e4e4e0", expw: "#ececec", bld: "#fdfdfc", ext: "#fbfbfa", mask: "#f1f1ef", area: "#b9bcbf", line: "#5d6166" },
  dark: { bg: "#1b1c1e", green: "#1f2321", water: "#192226", major: "#3a3b3e", majorC: "#2a2b2d", minor: "#303134", minorC: "#242527", foot: "#3d3e41", ctx: "#2f3033", expw: "#3a3b3e", bld: "#27282b", ext: "#2f3034", mask: "#121314", area: "#55585c", line: "#8e9297" },
};
let shadeBuilt = false, lastMode = "standard";
const HEAT_OPACITY = ["interpolate", ["linear"], ["zoom"], 12, .9, 16, .85, 18, .6];
const DOT_OPACITY = ["interpolate", ["linear"], ["zoom"], 14.8, 0, 15.8, .9];
function setupMapModes() {
  map.addSource("shadeNet", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addSource("heat", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  const before = map.getLayer("mask") ? "mask" : undefined;
  map.addLayer({ id: "bldLine", type: "line", source: "bld", minzoom: 14, layout: { visibility: "none" }, paint: { "line-width": ["interpolate", ["linear"], ["zoom"], 14, .4, 17, .9], "line-opacity": .85 } }, before);
  // Invisible, wide lines so a click on a street can report its values.
  map.addLayer({ id: "shadeNet", type: "line", source: "shadeNet", layout: { visibility: "none" }, paint: { "line-width": 12, "line-opacity": .01 } }, before);
  map.addLayer({ id: "heatMap", type: "heatmap", source: "heat", layout: { visibility: "none" },
    paint: { "heatmap-weight": ["get", "w"], "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 12, .9, 15, 1.2, 18, 1.5],
      "heatmap-radius": ["interpolate", ["exponential", 1.7], ["zoom"], 12, 26, 14, 46, 16, 100, 18, 220],
      "heatmap-opacity": 0, "heatmap-opacity-transition": { duration: 500 },
      "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"],
        0, "rgba(255,226,150,0)", .04, "rgba(255,226,150,.1)", .15, "rgba(255,212,120,.28)", .3, "rgba(255,186,96,.42)",
        .5, "rgba(255,150,74,.56)", .7, "rgba(250,112,66,.66)", .85, "rgba(234,76,72,.74)", 1, "rgba(204,44,84,.82)"] } }, before);
  map.addLayer({ id: "heatDots", type: "circle", source: "heat", minzoom: 14.8, layout: { visibility: "none" },
    paint: { "circle-radius": ["interpolate", ["linear"], ["sqrt", ["get", "n"]], 1, 2.5, 12, 9], "circle-color": "rgba(255,255,255,.92)",
      "circle-stroke-color": "#f0643c", "circle-stroke-width": ["interpolate", ["linear"], ["sqrt", ["get", "n"]], 1, 1.2, 12, 2.6],
      "circle-opacity": 0, "circle-stroke-opacity": 0, "circle-opacity-transition": { duration: 400 }, "circle-stroke-opacity-transition": { duration: 400 } } });
  map.on("click", "shadeNet", e => shadePopup(e));
  map.on("click", "heatDots", e => heatPopup(e));
  for (const id of ["shadeNet", "heatDots"]) {
    map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
  }
}
let heatHideTimer = 0;
function updateMapModes() {
  if (!mapReady) return;
  const m = state.mapMode;
  if (m !== lastMode) { lastMode = m; applyTheme(); }
  if (m === "shade" && !shadeBuilt) {
    shadeBuilt = true;
    map.getSource("shadeNet").setData({ type: "FeatureCollection", features: D.segs.map((g, i) => ({ type: "Feature", properties: { i }, geometry: { type: "LineString", coordinates: segCoords(i) } })) });
  }
  FlowOverlay.set(m === "shade", state.time);
  map.setLayoutProperty("shadeNet", "visibility", m === "shade" ? "visible" : "none");
  map.setLayoutProperty("bldLine", "visibility", m !== "standard" && !state.is3d && state.layers.build ? "visible" : "none");
  if (m === "heat") {
    const rows = D.pois.map((p, i) => ({ p, i, n: popularity(i).total })).filter(x => x.n > 0);
    const max = Math.max(1, ...rows.map(x => x.n));
    map.getSource("heat").setData({ type: "FeatureCollection", features: rows.map(({ p, i, n }) => ({ type: "Feature", properties: { i, n, w: Math.pow(Math.log1p(n) / Math.log1p(max), 1.15) }, geometry: { type: "Point", coordinates: [p.lng, p.lat] } })) });
    clearTimeout(heatHideTimer);
    ["heatMap", "heatDots"].forEach(id => map.setLayoutProperty(id, "visibility", "visible"));
    requestAnimationFrame(() => {
      map.setPaintProperty("heatMap", "heatmap-opacity", HEAT_OPACITY);
      map.setPaintProperty("heatDots", "circle-opacity", DOT_OPACITY);
      map.setPaintProperty("heatDots", "circle-stroke-opacity", DOT_OPACITY);
    });
  } else if (map.getLayoutProperty("heatMap", "visibility") === "visible") {
    map.setPaintProperty("heatMap", "heatmap-opacity", 0);
    map.setPaintProperty("heatDots", "circle-opacity", 0);
    map.setPaintProperty("heatDots", "circle-stroke-opacity", 0);
    clearTimeout(heatHideTimer);
    heatHideTimer = setTimeout(() => { if (state.mapMode !== "heat") ["heatMap", "heatDots"].forEach(id => map.setLayoutProperty(id, "visibility", "none")); }, 520);
  }
}
function shadePopup(e) {
  const i = e.features[0].properties.i, g = D.segs[i], L = g[1] || 1, t = state.time;
  const level = g[10] ? `${T("sviLevel")} ${g[11].toFixed(1)} / 3` : T("noSvi");
  new maplibregl.Popup({ closeButton: false, offset: 6, maxWidth: "240px" }).setLngLat(e.lngLat).setHTML(
    `<b>${T("shadeAt")(D.times[t].h)} ${Math.round(g[12][t] / L * 100)}%</b><div class="popMeta tn">${level}</div>
     <div class="popMeta tn">${T("sviCover")} ${Math.round(g[10] / L * 100)}% · ${T("coveredPath")} ${Math.round(g[2] / L * 100)}%</div>`).addTo(map);
}
function heatPopup(e) {
  const i = e.features[0].properties.i, p = D.pois[i], x = popularity(i);
  new maplibregl.Popup({ closeButton: false, offset: 8, maxWidth: "240px" }).setLngLat([p.lng, p.lat]).setHTML(
    `<b>${esc(poiName(i))}</b><div class="popMeta tn">${x.total.toLocaleString()} ${T("postsWord")} · ${periodLabel()}</div>
     <div class="popMeta">${p.source === "instagram" ? T("tagPlace") : T("referencePlace")}</div>`).addTo(map);
}
function modeControls() {
  return `<div class="lbl" style="padding:2px 0 6px">${T("mapStyle")}</div><div class="modes">${MAP_MODES.map(m => `<button data-mode="${m}" aria-pressed="${state.mapMode === m}"><span class="modeSwatch ${m}" aria-hidden="true"></span>${T("mode_" + m)}</button>`).join("")}</div>`;
}
function modeLegend() {
  if (state.mapMode === "shade") return `<span class="legendTitle">${T("legendShadeNet")(D.times[state.time].h)}</span><span class="legendScale"><span>${T("legendCool")}</span><span class="ramp shadeRamp" aria-hidden="true"></span><span>${T("legendHot")}</span></span>`;
  if (state.mapMode === "heat") return `<span class="legendTitle">${T("legendHeat")}</span><span class="legendScale"><span>${T("legendFew")}</span><span class="ramp heatRamp" aria-hidden="true"></span><span>${T("legendMany")}</span></span>`;
  return "";
}
function installModeText(I18N) {
  Object.assign(I18N.zh, {
    mapStyle: "地图样式", mode_standard: "标准", mode_shade: "遮阴", mode_heat: "热度", noSvi: "无 SVI（用 3D 模型）", coveredPath: "有盖", shadeAt: h => `${h}:00 遮阴`,
    legendShadeNet: h => `街道降温 · ${h}:00`, legendCool: "凉爽", legendHot: "暴晒", legendHeat: "发帖热度（样本）", legendFew: "少", legendMany: "多",
    startExit: "起点出口", endStation: "终点站", endExit: "终点出口", autoChoice: "自动", autoNearest: "自动选择", exitAuto: c => `自动（${c}）`,
    exitHint: "点地图上的出口小标，可以直接设为起点。", exitsNote: n => `研究区周边 ${n} 个出口已接到步行路网；距离路网超过 120 米的出口没有使用。遮阴地图的流线只是示意，颜色来自以 SVI 为主的遮阴估算，不代表模拟的气流。`,
  });
  Object.assign(I18N.en, {
    mapStyle: "Map style", mode_standard: "Standard", mode_shade: "Shade", mode_heat: "Popularity", noSvi: "No SVI (3D model used)", coveredPath: "covered", shadeAt: h => `Shade at ${h}:00`,
    legendShadeNet: h => `Street cooling · ${h}:00`, legendCool: "Cool", legendHot: "Exposed", legendHeat: "Post activity (sample)", legendFew: "Few", legendMany: "Many",
    startExit: "Start exit", endStation: "End station", endExit: "End exit", autoChoice: "Auto", autoNearest: "Choose automatically", exitAuto: c => `Auto (${c})`,
    exitHint: "Select an exit tag on the map to start there.", exitsNote: n => `${n} exits around the study area are joined to the walking network; exits more than 120 m from it are not used. The flowing lines on the shade map are illustrative: colour comes from the shade estimate, mainly SVI, not from a modelled air flow.`,
  });
}
