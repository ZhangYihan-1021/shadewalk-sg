/* Aggregate place/day data only. No captions, post URLs, usernames, or media. */
function periodBounds() {
  if (state.period === 'all') return [P.meta.earliest, P.meta.latest];
  if (state.period === 'custom') return [state.dateFrom, state.dateTo];
  return [P.meta.windowStart, P.meta.windowEnd];
}
function popularity(i) {
  const [from, to] = periodBounds();
  let tags = 0, captions = 0;
  for (const [date, tag, caption] of D.pois[i].days) {
    if (date >= from && date <= to) { tags += tag; captions += caption; }
  }
  return { tags, captions: state.includeCaptions ? captions : 0, total: tags + (state.includeCaptions ? captions : 0) };
}
function visiblePlaces() {
  const q = state.search.trim().toLocaleLowerCase();
  let rows = D.pois.map((p, i) => ({ p, i, ...popularity(i) }))
    .filter(({p}) => (state.catalogue === 'all' || p.source === state.catalogue)
      && (state.cat === 'all' || p.cat === state.cat)
      && (!q || (p.en + ' ' + p.zh + ' ' + p.id).toLocaleLowerCase().includes(q)));
  if (state.sort === 'name') rows.sort((a,b) => a.p.en.localeCompare(b.p.en) || a.p.id.localeCompare(b.p.id));
  else rows.sort((a,b) => (a.total === 0) - (b.total === 0)
    || (state.sort === 'fewer' ? a.total-b.total : b.total-a.total) || a.p.id.localeCompare(b.p.id));
  return rows;
}
function periodLabel() {
  const [a,b] = periodBounds();
  return `${a} → ${b} · SGT`;
}
function countText(i) {
  const x = popularity(i);
  return x.total ? `${x.total.toLocaleString()} ${T('postCount')}` : T('noMatchedPosts');
}
function placePicker() {
  const rows = visiblePlaces(), shown = rows.slice(0, state.listLimit);
  return `<div class="drill"><button class="backBtn" data-act="picker">‹ ${T('back')}</button><h2>${T('addPlaces')}</h2><span class="drillCount tn">${T('selectedCount')(state.sel.length)}</span></div>
    <input type="search" class="placeSearch" id="placeSearch" aria-label="${T('searchPlaces')}" placeholder="${T('searchPlaces')}" value="${esc(state.search)}">
    <div class="grid2"><select class="pillSel" id="catalogue" aria-label="${T('browseSource')}"><option value="instagram" ${state.catalogue==='instagram'?'selected':''}>${T('instagramLocations')}</option><option value="reference" ${state.catalogue==='reference'?'selected':''}>${T('referencePlaces')}</option><option value="all" ${state.catalogue==='all'?'selected':''}>${T('bothCatalogues')}</option></select>
    <select class="pillSel" id="popSort" aria-label="${T('sortBy')}"><option value="most" ${state.sort==='most'?'selected':''}>${T('mostPosts')}</option><option value="fewer" ${state.sort==='fewer'?'selected':''}>${T('fewerPosts')}</option><option value="name" ${state.sort==='name'?'selected':''}>${T('byName')}</option></select></div>
    ${state.catalogue !== 'instagram' ? `<select class="pillSel" id="placeCategory" aria-label="${T('category')}">${['all','museum','park','landmark','heritage','artwork','shopping','observed'].map(c=>`<option value="${c}" ${state.cat===c?'selected':''}>${T(c)}</option>`).join('')}</select>`:''}
    <div class="row">${seg('period', [['recent', T('fixed90')], ['all', T('allDates')], ['custom', T('customDates')]], state.period)}
    ${state.period === 'custom' ? `<div class="grid2"><label class="lbl">${T('dateFrom')}<input type="date" id="dateFrom" value="${state.dateFrom}" min="${P.meta.earliest}" max="${P.meta.latest}"></label><label class="lbl">${T('dateTo')}<input type="date" id="dateTo" value="${state.dateTo}" min="${P.meta.earliest}" max="${P.meta.latest}"></label></div>` : ''}
    <label class="checkNote"><input id="includeCaptions" type="checkbox" ${state.includeCaptions?'checked':''}>${T('includeCaptions')}</label></div>
    <button class="recommend" data-act="recommend">${T('recommendBtn')}</button>
    ${state.recommendNote ? `<div class="notice" role="status">${esc(state.recommendNote)}</div>`:''}
    <div class="poiList">${shown.map(({p,i,total,captions})=>`<button class="poiRow" data-act="poi" data-v="${i}" aria-pressed="${state.sel.includes(i)}" ${!p.routable?'disabled':''}>
      <span class="box">${state.sel.includes(i)?'✓':''}</span><span class="nm">${esc(poiName(i))}<small>${p.source==='instagram'?T('tagPlace'):T('referencePlace')}${!p.routable?' · '+T('browseOnly'):''}${captions?' · '+T('captionEvidence'):''}</small></span>
      <span class="postBadge tn ${total?'':'empty'}">${total?total.toLocaleString(): '—'}<small>${total?T('postCount'):T('noMatchedPosts')}</small></span></button>`).join('') || `<p class="note">${T('noResults')}</p>`}</div>
    ${rows.length>shown.length ? `<button class="moreBtn" data-act="loadMore">${T('showMore')} (${rows.length-shown.length})</button>`:''}
    <p class="note">${T('sampleNote')}</p>`;
}
function suggestPopularStops() {
  // A bounded greedy suggestion, not a claim of a globally optimal itinerary.
  const candidates = visiblePlaces().filter(x=>x.total>0 && x.p.routable).slice(0,80);
  const selection=[];
  for (const {i,p} of candidates) {
    if (selection.length===3) break;
    if (selection.some(j=>placeDistance(p,D.pois[j])<200)) continue;
    const trial=plan(state.scheme,[...selection,i]);
    if (trial && trial.L/WALK <= state.limit) selection.push(i);
  }
  if (selection.length) {
    state.sel=selection;
    state.recommendNote=T('suggestedNote')(selection.length);
  } else state.recommendNote=T('noSuggestions');
  refresh(true);
}
function placeDistance(a,b) {
  return Math.hypot((a.lng-b.lng)*111280*Math.cos(a.lat*Math.PI/180),(a.lat-b.lat)*110575);
}
function popularityDataNotes() {
  return `<section class="group"><h3>${T('popTitle')}</h3><p class="note">${T('dataExplanation')}</p>
    <div class="metrics tn"><div><b>10,692</b><span>${T('collected')}</span></div><div><b>4,548</b><span>${T('insideStudy')}</span></div><div><b>1,649</b><span>${T('fixed90')}</span></div></div>
    <p class="note">${T('identityNote')} ${T('noDataNote')}</p><p class="note">${T('routingNote')}</p><p class="note">${T('popRouteNote')}</p></section>`;
}
