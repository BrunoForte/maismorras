# Bundle budget

`npm run build` emits Vite's manifest. `npm run check:bundle-budget` follows static imports from the SvelteKit start/app/layout plus the `/` and `/overlay` route nodes, then separately walks dynamic imports reachable from those routes. The limits are on minified, uncompressed JavaScript bytes; gzip is reported for diagnosis but is not used to hide runtime parse/transfer costs.

| Measure                       |        Before (2026-09-27) |           After (2026-09-27) |       Limit |
| ----------------------------- | -------------------------: | ---------------------------: | ----------: |
| `/` initial static JS         | 351,718 B / 102,604 B gzip |   380,125 B / 113,515 B gzip |   400,000 B |
| `/overlay` initial static JS  | 836,155 B / 228,232 B gzip |   345,756 B / 105,797 B gzip |   700,000 B |
| Optional lazy JS (`/`)        |               Not measured | 1,970,707 B / 558,922 B gzip | 2,500,000 B |
| Optional lazy JS (`/overlay`) |               Not measured | 2,005,076 B / 566,640 B gzip | 2,500,000 B |

LiveKit was statically imported by the overlay route; it is now loaded only when a LiveKit camera is configured. This reduced overlay initial JS by 490,399 B (58.6%). The root initial graph increased 28,407 B (8.1%) during route/component extraction and remains below its 400,000 B ceiling. The route and map/editor components remain conditional imports, and DiceBox3D remains demand-loaded after a 3D roll is requested. Large optional chunks are reported separately and do not count as initial transfer until requested.

To update a limit, first run a production build and this script, inspect the changed manifest graph, and confirm that newly static imports are genuinely needed at first paint. Change the constants in `scripts/check-bundle-budget.mjs` only with a short explanation in the change description. Do not raise a limit merely to silence Vite's chunk warning; optional modules are allowed to remain large when they are actually lazy-loaded.
