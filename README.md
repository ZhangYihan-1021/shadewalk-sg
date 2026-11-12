# ShadeWalk Singapore

A prototype of shade-oriented walking routes between MRT stations and attractions in the Singapore Central Area. It is the group project of Group 1 for AR5958A (AI methods in urbanism) at the National University of Singapore, AY2026/27 Semester 1.

Group members are Glen Ang Xun Zhe, Haoyang He, Shuo Yang and Yihan Zhang.

## Live demo

Open the GitHub Pages site of this repository. The page loads MapLibre GL JS from cdnjs, so it needs an internet connection.

## What the prototype does

- Builds four routes through the chosen places, namely a shade route (mainly street-view based), a popular route (Instagram sample), a covered-linkway route and the shortest route.
- Lets the user pick start and end MRT exits, or leave them on automatic.
- Offers three map styles, namely standard, shade (segments coloured by shade level, which changes with departure time) and popularity (post counts of the sampled period).

## Data sources

- OpenStreetMap (© OpenStreetMap contributors, ODbL), downloaded 4 Nov 2026
- LTA DataMall, Covered Linkway, Footpath and Pedestrian Overhead Bridge/Underpass (September 2026 release)
- data.gov.sg, SLA National Map Line, LTA MRT Station Exit, STB Tourist Attractions, NParks Parks
- Meta/WRI global canopy height map (Tolan et al., 2024, CC BY 4.0)
- ESA WorldCover 2021 v200 (CC BY 4.0)
- Public Instagram posts collected with Apify, snapshot 4 Nov 2026. The site holds only anonymised place and date counts, with no captions, post links, usernames or media.
- Street-view shade levels and image segmentation shares provided by group members

This repository holds only the processed web data. Raw LTA files and other source data are not included.

## Known limits

- This is a course prototype. No result has been checked in the field.
- Street-view scores cover about 54% of the walking network by length. The rest uses a 3D model estimate. The level conversion, detour weights and the 60 m search radius are prototype assumptions.
- Post counts are a sample and do not measure visitor numbers.
- Routes are not verified pedestrian navigation. Entrances, opening hours, steps and accessibility have not been checked.

## Use

For course presentation and discussion only. Do not use the routes for real navigation.
