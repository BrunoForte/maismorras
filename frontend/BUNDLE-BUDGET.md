# Bundle budget

`npm run build` emits Vite's manifest. `npm run check:bundle-budget` follows static imports from the SvelteKit start/app/layout plus the `/` and `/overlay` route nodes, then separately walks dynamic imports reachable from those routes. The limits are on minified, uncompressed JavaScript bytes; gzip is reported for diagnosis but is not used to hide runtime parse/transfer costs.

| Measure                       |        Before (2026-09-27) |           After (2026-09-29) |       Limit |
| ----------------------------- | -------------------------: | ---------------------------: | ----------: |
| `/` initial static JS         | 351,718 B / 102,604 B gzip |    170,630 B / 60,613 B gzip |   400,000 B |
| `/overlay` initial static JS  | 836,155 B / 228,232 B gzip |    135,514 B / 52,407 B gzip |   700,000 B |
| Optional lazy JS (`/`)        |               Not measured | 2,187,558 B / 616,265 B gzip | 2,500,000 B |
| Optional lazy JS (`/overlay`) |               Not measured | 2,222,674 B / 624,471 B gzip | 2,500,000 B |

LiveKit was statically imported by the overlay route; it is now loaded only when a LiveKit camera is configured. This reduced overlay initial JS by 490,399 B (58.6%). The root initial graph increased 28,407 B (8.1%) during route/component extraction and remains below its 400,000 B ceiling. The route and map/editor components remain conditional imports, and DiceBox3D remains demand-loaded after a 3D roll is requested. Large optional chunks are reported separately and do not count as initial transfer until requested.

The 2026-09-29 build moved `@supabase/supabase-js` out of the static route graph behind the existing auth/Storage/realtime points of use. It remains a shared singleton and loads asynchronously when the app restores authentication or a feature needs Storage. This reduces `/` initial JS by 210,103 B (55.2%) and `/overlay` by 210,238 B (60.8%) versus the immediately preceding build, without changing the SDK, API, or auth flow. Expect a short async SDK-load step while session restoration is in progress; the route already presents its loading state during that phase.

Against the immediate pre-change build measured for this task, `/` fell from 380,733 B to 170,630 B (−210,103 B, 55.2%) and `/overlay` from 345,752 B to 135,514 B (−210,238 B, 60.8%). The static bundle gzip values after the change are 60,613 B and 52,407 B respectively. The async SDK is still required to restore Google OAuth sessions on `/`; the improvement moves that work out of blocking static route imports and into the route's existing loading phase, rather than removing that SDK transfer from authenticated startup.

Two optional chunks still exceed 400 kB, but are dependency-owned, independently lazy-loaded, and do not overlap each other:

| Optional chunk |  Minified |      Gzip | Ownership and loading boundary                                                                      |
| -------------- | --------: | --------: | --------------------------------------------------------------------------------------------------- |
| `DO5lHaxM2.js` | 519,390 B | 135,190 B | `livekit-client` bundled ESM; loaded only when a configured LiveKit camera mounts `LiveKitPreview`. |
| `B0Q-vOGA.js`  | 544,930 B | 141,720 B | `@3d-dice/dice-box-threejs` single bundled ESM; loaded only for an actual 3D dice roll.             |

Source-map inspection attributes virtually all of each chunk to the named package (about 1.38 MB and 697 kB source respectively). The current package entry points are each one bundled ESM file, rather than independently importable feature modules. Splitting either with `manualChunks` would only move the same code into another downloaded chunk, add requests/coordination, and not reduce the amount loaded for that feature; no internal duplicate copy was found in the manifest graph. These are documented exceptions to the 400 kB target, not reasons to suppress Vite's warning. Revisit only if the packages expose smaller supported entry points or are replaced. The report now lists the largest chunks per route plus shared initial/lazy chunks so future builds can verify this assumption.

To update a limit, first run a production build and this script, inspect the changed manifest graph, and confirm that newly static imports are genuinely needed at first paint. Change the constants in `scripts/check-bundle-budget.mjs` only with a short explanation in the change description. Do not raise a limit merely to silence Vite's chunk warning; optional modules are allowed to remain large when they are actually lazy-loaded.
