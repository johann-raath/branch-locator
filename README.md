# Capitec Branch Locator

A mobile-first branch locator for Capitec, built with Angular. Find a branch by name or place, see whether it is open (now, or at a day and time you plan to visit), and get directions.

## Quick start (Docker)

```bash
docker build -t branch-locator .
docker run --rm -p 8080:8080 branch-locator
```

Open **http://localhost:8080**. The container runs nginx as a non-root user, has a health check (`/healthz`), and needs no network except for map tiles from OpenStreetMap.

> **After rebuilding the image**, a browser that has already visited still has the previous version stored for offline use. It shows a **Reload** message once the new one has downloaded.

> **"Near me" needs a secure context.** Browsers only allow geolocation on `https://` pages or on `localhost`. `http://localhost:8080` works. If you serve the container from another host over plain HTTP, the app says so instead of failing silently; put it behind TLS to enable it.

## Develop, build, test

Needs Node 24 (the version the Docker build uses) and npm.

```bash
npm ci
npm start                    # dev server on http://localhost:4200 (simulated API latency on)
npm run build                # production bundle in dist/
npm test -- --watch=false    # app tests (Vitest, jsdom)
npm run data:test            # tests for the dataset build script
npm run lint                 # ESLint (angular-eslint, incl. template accessibility rules)
npm run format:check         # Prettier; `npm run format` fixes
```

### Browser smoke tests (against the container)

Unit tests cannot catch failures that exist only in the optimised production bundle, so a small Playwright suite drives the **running Docker container** in a real browser, at phone and desktop sizes. It checks that the map loads with no script or Content-Security-Policy errors, and covers place search, keyboard use, picking a branch (popup, directions, details by screen size), the results list as a side panel and as a bottom sheet, the business-centre and wheelchair filters, dark mode, Near me (granted, and blocked), grey pins for closed branches, shared links, and working offline.

```bash
docker build -t branch-locator .
docker run -d --rm --name bl -p 8080:8080 branch-locator
npm run e2e                     # uses the Chrome installed on your machine; no browser download
# no Chrome? use Edge:  E2E_CHANNEL=msedge npm run e2e   (PowerShell: $env:E2E_CHANNEL='msedge'; npm run e2e)
docker stop bl
```

`E2E_BASE_URL` points the suite somewhere other than `http://localhost:8080`.

CI (`.github/workflows/ci.yml`) runs lint, the formatting check, both test suites and the production build, then builds the image, runs it, checks the endpoints and runs the browser smoke tests against it, on every push.

## Try any moment in time: `?now=`

All "open now" logic runs off an injected `Clock`. Add `?now=` (South African time, `YYYY-MM-DDTHH:mm`) to jump to a moment:

| URL | Shows |
|---|---|
| `/?now=2026-12-16T10:30` | Day of Reconciliation (public holiday) |
| `/?now=2026-12-24T11:30` | Christmas Eve, closing at 12:00 |
| `/?now=2027-03-21T10:00` | Sunday; Human Rights Day moves to Monday 22 Mar |
| `/?now=2026-11-27T20:00` | A Friday evening (late trading at Canal Walk) |

The override is controlled by `environment.allowClockOverride`. It is **on** in the dev and Docker/demo builds so it can be used during review. It would be turned off for real production use. All time logic uses `Africa/Johannesburg`, not the browser's time zone.

## What it does

**Layout.** The map fills the screen. A search bar floats on top, a control bar sits at the bottom. Phone, tablet (768 to 1199 px) and desktop (1200 px and up) each have their own layout.

| | Phone | Tablet | Desktop |
|---|---|---|---|
| Search bar | full width, minus theme button | spans the top edge, larger controls | 420 px, top left |
| Tap a pin | popup with **More** and **Get directions** | same | details card opens on the left at once; popup has **Get directions** only |
| Details | swipe-away drawer, about 88% wide | floating card | floating card |
| Results list | bottom sheet | side list in landscape, bottom sheet in portrait | side list |

**Results list.** Lists what is relevant right now: after a place search or Near me, the branches in range, nearest first with distances and a 15/30/50 km picker; with typed text, the name matches; once zoomed in, the branches in view. It follows the same filters as the map, and shows at most 50 rows. On desktop and landscape tablets it is a collapsible panel on the left, where a row opens the details (the back arrow returns). On phones and portrait tablets it is a bottom sheet, opened with **Show list** above the control bar; a row closes the sheet and shows that branch's popup on the map. It also gives keyboard and screen-reader users a way to browse without the map.

**Search.** Typing shows matching **places** (cities and suburbs) and **branches**. Picking a branch shows its popup. Picking a place searches *around it*: results are limited to **15 km** (switchable to 30 or 50 km at the top of the results list), and the radius widens by itself if nothing is in range. Typing again goes back to a plain name search.

**Places are built from the branch data**, so search works offline with no geocoding service. A place sits at the median position of its branches. This is approximate (it is not a city centre) and is the first thing to replace with a geocoder if street-level accuracy is needed.

**Filters** only ever narrow results; an unticked box excludes nothing.

- Gear: ATM, cash deposit, card replacement, business, forex.
- **Business centres are opt-in**: hidden by default, shown when *Business* is ticked. The default result is the nearest standard branch.
- Wheelchair icon in the search bar: toggles wheelchair-accessible branches only.
- Watch: show only branches open **now**, or at a day and time in the next 7 days.

**Near me** finds you and focuses the nearest matching branch within the radius. If you are far from every branch it shows the closest one and how far away it is. While "Near me" is the search, changing the open time, filters or distance moves to the nearest branch that still matches. Denied permission, timeouts, no GPS and insecure connections each get their own message.

**Pins** are blue when a branch is open and grey when it is closed, now or at the visit time chosen under the watch.

**Sharing.** The address bar follows what is on screen (place, radius, search text, filters, selected branch), so any view can be bookmarked or sent. **Share** is on the map popup and the details (a link to that branch) and on the results list (a link to the place or name search). A branch link opens like a tapped pin: the popup, plus the details card on desktop. Touch devices open the system share sheet; elsewhere the link is copied. A user's own location is never put in a link.

**Offline.** After the first visit the app shell, fonts and branch data are stored by a service worker, so search, filters, hours and details work with no connection. Map tiles are not pre-downloaded (the OpenStreetMap tile policy does not allow it); the browser's ordinary cache may still show areas already viewed. It needs https or `localhost`, and is off in the dev server.

**Opening state** follows a fixed precedence: branch status (temporarily closed, relocated, opening soon), then special hours (public holidays, training, events), then the weekly pattern. Consecutive days with the same hours are grouped (Monday to Friday).

**Appearance.** Light, Dark, System default (follows the OS live) or Day/night based (light 6am to 6pm, device local time). The choice is remembered. The theme is applied before first paint so dark mode does not flash white.

## Architecture

```
src/app/
  core/
    models/       Branch, notices, service labels
    services/     pure logic: opening hours, public holidays, search/filter/sort, places, result list,
                  hour grouping, geo, share URLs, Clock
    data/         BranchRepository (abstract) and HttpBranchRepository
    state/        BranchStore (signals), UiState, ThemeService, ShareService, AppStatus
    interceptors/ dev-only latency
  features/       search-bar, bottom-bar, results-panel, branch-map, branch-detail
scripts/          dataset build pipeline (Overture Maps to public/api/*.json) and its tests
e2e/              browser smoke tests
```

- **Pure services, thin components.** Opening hours, search, filtering, places, radius and side-list logic are plain functions with unit tests; components only read signals from `BranchStore`.
- **Built to talk to an API.** Components depend on the abstract `BranchRepository`, never on `HttpClient`. Today's implementation reads static JSON served by nginx; a real or .NET API would be a second implementation with no component changes. Real HTTP means real loading and error states: a dev-only latency interceptor, one retry, a cached result and a retry button.
- **Zoneless, standalone, signals**, built-in control flow, no router.
- **Accessible by default**: labelled controls, `aria-pressed`/`aria-expanded`, and a keyboard-operable combobox search (arrow keys highlight, Enter picks, Escape closes, `aria-activedescendant` for screen readers). Controls come before the map in the DOM, so Tab reaches search first. Focus moves into the details panel, and Escape closes layers one at a time. Template accessibility rules are enforced by the linter.
- **Leaflet is lazy-loaded** into its own chunk, so the initial bundle is about 260 kB (the map libraries add about 184 kB on first paint of the map).

### Production notes

- The service worker is Angular's (`ngsw-config.json`), wrapped by `public/sw.js` so that cross-origin requests (map tiles) bypass it.
- nginx serves hashed bundles with a one-year `immutable` cache, `index.html` with `no-cache`, and the data JSON for 5 minutes.
- Security headers on every response, including a Content-Security-Policy (`script-src 'self'`, images only from self and the OpenStreetMap tile server) and `Permissions-Policy`. Fonts (Poppins) are self-hosted; nothing loads from a CDN.
- Runs as a non-root user (nginx-unprivileged), exposes 8080, has a `HEALTHCHECK`.
- Leaflet's marker-cluster plugin is accessed through `window.L` (see `branch-map/leaflet.ts`): in the optimised bundle `import * as L` is a snapshot taken before the plugin runs. This only shows in the production build, which is why the smoke tests run against the container.

## Data

### Where it comes from

- Branch **names, locations and addresses** come from [Overture Maps Places](https://overturemaps.org), release `2026-11-18.0`, licensed **CDLA-Permissive-2.0**. Records originating from AllThePlaces are **CC0-1.0**. Contributing sources: AllThePlaces, Microsoft, meta, Foursquare (see `sources` on each record).
- **Map tiles** are (c) OpenStreetMap contributors, shown through Leaflet's attribution. No OpenStreetMap *data* is used.
- The dataset is **901 places**: 881 branches and 20 business centres, nationally. ATMs are in the export but excluded (see follow-ups).

### What is invented

**Opening hours, services (including wheelchair access) and notices are invented.** No source has them. They exist to show every feature of the app and do not reflect Capitec's actual branch information. They are assigned deterministically (a hash of the branch id), so a rebuild gives identical output. The app says so wherever they appear (list, details and map popup).

Showcase scenarios (defined in `scripts/data/scenarios.json`):

| # | Scenario | Branch |
|---|---|---|
| S1 | Lunch closure 13:00-13:45, weekdays | Paarl Lady Grey 70 |
| S2 | Staff training, Wednesdays open 09:30 | Stellenbosch Die Boord |
| S3 | Late trading, Fridays until 21:00 | Canal Walk |
| S4 | Temporarily closed today and tomorrow | Cape Town St. Georges Mall |
| S5 | Closing early today at 14:00 | Stellenbosch Eikestad Mall |
| S6 | Relocated to Paarl Mall | Paarl |
| S7 | Opening in 10 days | Sea Point |
| S8 | Reduced hours on public holidays | Any mall-profile branch |
| S9 | Business centre closed all weekend | Any business centre |

S4, S5 and S7 are **date-relative**: they live in `public/api/notices.json` as day offsets and are resolved against the app's `Clock` when the data loads, so they show on whatever day the app is opened. Public holidays (Dec 2026 to Dec 2027, including the Sunday-to-Monday rule) are absolute.

### Known data limitations

- Source records can be up to a year old (Microsoft records date from Oct 2025).
- A few addresses contain source typos (e.g. "Cecilia Sqaure"). These are not fixed by hand.
- Phone numbers are the national call centre number for every branch.
- Many suburbs equal the city: Microsoft records only carry a locality, so suburb-level place search is thin.
- Apostrophes are lost in names derived from locator slugs (e.g. "Gordons Bay").
- Capitec reports about 880 branches; this dataset has 881 branches plus 20 business centres. A handful of near-duplicates may remain or have been merged wrongly (see the build log).

### How the dataset is built

The built files (`public/api/branches.json`, `notices.json`) are committed, so building the app or the Docker image needs no data step. To refresh them:

```bash
duckdb -c ".read overture-capitec.sql"   # writes overture-capitec.json (change the release name in the query to refresh)
# move it to scripts/data/overture-capitec.json
npm run data:build                       # writes public/api/branches.json and notices.json
```

`npm run data:build -- --offline` skips Nominatim and uses `scripts/data/geocode-cache.json` only. The build is fully automated, validates every record (and fails on errors), and writes `scripts/data/build-log.txt` with every drop, merge and geocode.

Deviations from a naive filter, all logged:

- Real branches named like "Capitec Vredendal" or "De Aar Capitec Bank" are kept; typo names ("Capitac Bank") are dropped.
- Classification is by **name**, not category: many real branches carry a bogus category such as `atm` or `restaurant`.
- Duplicates (same place from two sources) are merged within 60 m, or within 200 m when the sources differ and the names share a distinctive word.
- About a dozen records with no usable address are filled by reverse-geocoding with Nominatim (1 request/second, cached).

### Why static JSON over HTTP, not a backend

This is a frontend project and the data is static. A backend that only returns a file would add a second build, a second container and CORS setup without adding value. The app is instead built to talk to an API (see Architecture), so a real one slots in behind `BranchRepository`.

## Follow-ups

- **Nearest ATM.** The export holds about 1,850 ATM records with full addresses. A second `atms.json` from the same pipeline and a type toggle would add it.
- A .NET API with server-side radius and service filtering, plugged in as a second `BranchRepository`.
- Real hours and services, if accurate data is provided. The pipeline keeps the same shape.
