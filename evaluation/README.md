# ShadeWalk route evaluation

This folder holds the script and results behind Section 5.1, Table 2, Figure 9 and Appendix D of the
[ShadeWalk final report](https://zhangyihan-1021.github.io/shadewalk-sg/report.html). The script calls the
website's own routing function, so the routes are the ones a user gets on the
[live demo](https://zhangyihan-1021.github.io/shadewalk-sg/).

## Files

| File | What it is |
| --- | --- |
| `route_evaluation_console.js` | The script, pasted into the browser console on the live demo |
| `route_evaluation_results.json` | Demo routes, planning-view figures, counts, and medians with quartiles |
| `route_evaluation_itineraries.csv` | One row per test itinerary, which opens in Excel |

## How to run it again

1. Open https://zhangyihan-1021.github.io/shadewalk-sg/ in Chrome or Edge and wait for the map to load.
2. Press F12 and open the Console tab.
3. Paste the whole of `route_evaluation_console.js` and press Enter. If the browser warns about pasting,
   type `allow pasting`, press Enter and paste again.
4. Keep the tab open for about two minutes and do not click the page.
5. Two files download at the end. They should match the files here, apart from the `generated_at` time.

To run it without downloads, enter `window.ROUTE_EVAL_SKIP_DOWNLOAD = true` first. The result is then
kept in `window.__routeEval`.

## What was tested

- 300 itineraries were kept from 1,958 random draws, using a fixed seed (595813).
- Each draw has a random start among the 10 MRT stations inside the study area and three different stops
  at least 200 m apart.
- Stops come from the 60 Instagram location tags with the most posts between 6 Aug and 3 Nov 2026.
- A draw is kept only if its shortest route fits the 60-minute limit, at the site's walking speed of
  75 m per minute.
- As on the live demo, a route ends at the lowest-cost exit among the 138 exits of 27 stations around the
  study area.
- Routes use 13:00 and the Balanced setting (weight 2.5) unless a field name says otherwise.
- Medians use the nearest rank, rounded down.

## Results used in the report

| Report | Result | Value | Field in the JSON file |
| --- | --- | --- | --- |
| 5.1, Figure 9 | Median shortest route | 3.96 km, 53 min, 50.9% shade | `summary.shortest_*` |
| 5.1, Figure 9 | Shade route against shortest | +202 m, +16.0 points | `summary.shade_vs_shortest_*` |
| 5.1, Figure 9 | Linkway route against shortest | +224 m, +12.4 points | `summary.linkway_vs_shortest_*` |
| 5.1, Figure 9 | 3D baseline against shortest | +324 m, +16.1 points | `summary.model3d_vs_shortest_*` |
| 5.1, Figure 9 | Popular route against shortest | +42 m, +1.3 points | `summary.popular_vs_shortest_*` |
| 5.1 | Routes with 100 m or more exposed in a row | 269 shortest, 168 shade, of 300 | `counts` |
| 5.1, Table 2 | Shorter and Detours OK settings against shortest | +60 m, +9.1 points and +322 m, +18.8 points | `summary.detour_*` |
| 5.1 | Length shared by VLM-led and 3D-led routes | 57% | `summary.overlap_shade_model3d_pct` |
| 5.1 | Share of the 13:00 route kept at 9:00 and 17:00 | 59% and 76% VLM-led, 40% and 37% 3D-led | `summary.time_*` |
| 5.1 | Shade routes over 60 minutes | 66 of 300 | `counts.shade_route_over_limit` |
| 5.4 | Busiest streets, and those with low shade at 13:00 | 11.0 km, 1.5 km | `planning_view` |

## Checks

The script was run on 17 Nov 2026 against a copy of the published site files, and four of the itineraries
were recomputed on the live demo with identical distances and shade shares. The routes of the report's
worked example (Section 4.2) also match `demo.opening_stops`.

A first version of this script ran on 9 Nov 2026 against an earlier build of the site in which routes could
end only at the 10 stations inside the study area. Its results were used in the group presentation, so
the presentation numbers differ slightly from the report (for example +187 m and +14.5 points for the shade
route).

## Data

The results contain place names, aggregated post counts, segment IDs and route measures. They contain no
captions, usernames or post links.
