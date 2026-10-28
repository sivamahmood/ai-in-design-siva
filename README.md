# Walking reach in Weimar

A 3D map of central Weimar that shows how far you can walk from any point in 5, 10 and 15 minutes, which buildings that reaches, and about how many people live there.

Click on the ground. The app starts at the nearest street junction, walks the pedestrian network, and draws three nested areas in three shades of blue. Buildings that touch an area turn the matching shade. A panel lists, for each time, the number of buildings reached and about how many residents live in the area. Buildings that are not reached are coloured by their main use; the legend names each colour. Drag to orbit, right-drag to pan, scroll to zoom.

A shade layer shows building shade for a chosen date and time (default 21 July, 14:00; the time slider runs from 08:00 to 20:00). The buildings cast shadows on the ground, streets in building shade turn dark slate and streets in sun amber, and the panel shows for each walking area the share of the walked street length that lies in shade.

The City Gardener plants trees on its own. When you start a walk, when you stop moving the time slider, and every 2 minutes (never more than once in 5 seconds), it looks at the sun, the 10 sunniest street segments of the current walk, those within 10 minutes of the start first (hours of sun from 11:00 to 17:00, counting the shade of all trees), where walks started recently, and its own trees. It then plants one tree, removes one of its own, or waits, and says why in one sentence. Its trees are a lighter green and 1.5 times the size of the suggested trees (a crown 12 m wide, 15 m tall), and count in the shade numbers. A yellow ring and column mark where it acted for 6 seconds, and after planting the view glides to the new tree. The Gardener panel logs each turn, newest on top, and can be paused. A "Demo mode" checkbox makes it busier for presentations: up to 5 trees per turn (each with its own reason), a turn every 20 seconds, up to 150 trees, all gardener trees twice the standard size and bright green, and the view stays on the whole city instead of following each tree. It only runs with `npm run dev` on your own computer: the dev server passes its notes to Claude Haiku through `claude -p` on your Claude account (`gardener-server.js`). On GitHub Pages the panel says "The gardener only thinks on localhost".

## Run it

```
npm install     install the packages
npm run dev     start the app at http://localhost:5173
```

`npm run build` makes the site in `dist/`. Every push to `main` publishes it to GitHub Pages at `https://<user>.github.io/<repo>/` through `.github/workflows/deploy.yml`.

## Method

- **Start.** The walk starts at the walkable junction of `streets.graph.json` nearest to the click. If none is within 100 m, the app says so and draws nothing.
- **Walking.** The walk follows the walkable edges of the network, using their `length` in metres, at 4.8 km/h, which is 80 m per minute: 400 m in 5 minutes, 800 m in 10, 1200 m in 15. A street you can only walk part of counts up to the point where the time runs out.
- **Areas.** Each area is the street pieces reached in that time with a band of 25 m on each side, joined into one shape. It follows the streets; it is not a circle and not a convex hull. The three areas are nested.
- **Buildings.** A building counts for an area if its footprint touches that area. The panel counts every building reached within the time, so the 10-minute number includes the 5-minute buildings.
- **Residents.** For every 100 m cell of the Zensus 2022 grid that overlaps an area, the app takes the cell's population times the share of the cell's area that lies inside. The sum is rounded to the nearest 10.
- **Cells without a figure.** Some cells have no published resident count (`population` is `null`). They are not zero. They are left out of the sum, and the panel says how many such cells overlap the area.

- **Sun position.** Altitude and direction of the sun over Weimar (50.98° N, 11.32° E) come from the NOAA solar position equations (after Meeus), with a small correction for refraction near the horizon. Times are Weimar clock times: CEST (UTC+2) in summer, CET (UTC+1) in winter.
- **Shade.** Buildings are rasterised into a 1 m grid of heights. A street point is in shade when, going from it toward the sun, a building rises above the line to the sun. Streets are checked every 2 m. The share in shade is the shaded length of the walked streets (the same street pieces that make each area) divided by their total length. When the sun is below the horizon, everything counts as shade.
- **Shadows in 3D.** The shadows on the ground are drawn by the graphics card from the same sun position; the percentages come from the calculation above, not from the picture.

## Limits

- Walking speed is the same for everyone, and waiting at crossings, steps and slopes are ignored.
- The band of 25 m is a simple stand-in for "close to the street"; it reaches across back gardens and into courtyards.
- Residents are assumed to be spread evenly over each 100 m cell, so the counts are estimates. The census also changes small counts slightly at random to protect privacy.
- The kit covers only part of Weimar (about 1.3 × 2 km). Near its edge the network, the buildings and the census cells stop, so areas there are cut short.
- Buildings are extruded to their highest point; roof shapes are not shown.
- Shade counts buildings and, when shown, the suggested trees. Existing trees, terrain, awnings and clouds are not included, and buildings are blocks of their highest point, which overstates shade from pitched roofs a little.
- Suggested trees have an assumed size, not a measured one: a round crown 8 m wide, 10 m tall in total. Only the crown casts shade, and it blocks the sun fully, while a real crown lets some light through. Only the trunk is kept clear of buildings, so in narrow lanes a crown can overlap a facade. Trees are placed for one date and time; they stay put when the slider moves.
- The gardener only sees the numbers it is given, not the map, and is a small, fast model, so its choices can be plain or odd; the app only refuses ids that are not in its list. A gardener tree goes on the chosen segment by the same rules as the suggested trees and is skipped if there is no room. Its trees are gone when you reload the page. Each turn takes a few seconds and uses your Claude account.
- Streets near the edge of the kit miss shade from buildings outside it.
- Shade is measured on the street centre line, not across the whole width of the street or square.

## Data

All data is in `public/data/`, described in `public/data/SOURCES.md`. Nothing is fetched from the internet.

| File | Content | Source | Licence |
| --- | --- | --- | --- |
| `buildings.geojson` | 4316 footprints, `height` in metres, main `use` | 3D building models LoD2 of Thuringia, © GDI-Th; uses: Egor Gaydukov | dl-de/by-2-0 |
| `streets.graph.json` | pedestrian network: 962 nodes, 1186 edges with `length` in metres | Egor Gaydukov, InfAU, Bauhaus-Universität Weimar | |
| `zensus.geojson` | 245 cells of 100 m with `population` in persons | Zensus 2022, © Statistische Ämter des Bundes und der Länder | dl-de/by-2-0 |

Buildings: 3D building models LoD2 © GDI-Th (dl-de/by-2-0). Land use and pedestrian network: Egor Gaydukov, InfAU, Bauhaus-Universität Weimar. Census grid: Zensus 2022, © Statistische Ämter des Bundes und der Länder (dl-de/by-2-0).

## How this was made

1. Tools: Claude Code, with the model Claude Opus 5.5.
2. I decided: to add building shade for a chosen date and time, because my thesis measures how much public space is shaded during summer heat.
3. The agent did: read the city kit, wrote the React Three Fiber app with the walking, band, resident and building-shade calculations, checked them against the data and wrote this README.
4. I checked: that shadows lengthen and turn toward the evening, and that the shade percentages change when I move the time slider.
