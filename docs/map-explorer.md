# 3D map explorer

The explorer is built from `explore.html`, `src/explore.ts`, and the reusable transformations in `src/map-data.ts`. It intentionally keeps records without verified coordinates in the evidence list instead of placing approximate markers.

## Basemap and 3D buildings

- Provider: [OpenFreeMap](https://openfreemap.org/) using the public Liberty style.
- Client: MapLibre GL JS, pinned and bundled by Vite rather than loaded from a runtime script CDN.
- Cost: the hosted public OpenFreeMap instance is currently free, permits commercial use, requires no API key, and states that it has no map-view/request limit. It does not provide an SLA; self-hosting remains the fallback.
- Building heights: the extrusion layer uses `render_height`, then `height`, and finally a clearly defined 10-meter fallback. Base height uses `render_min_height`, then `min_height`, then zero.
- Degraded mode: if the style has no compatible `building` source layer, the 2D basemap and activity markers/list remain usable.

## Current mapping coverage (audited 2026-10-19)

The public Supabase views contain 23 current ABC rows at 17 distinct addresses and 6 development projects. The frontend groups duplicate license types into 17 business activities, producing 23 activity cards in total.

Production Supabase now persists ten reviewed county location matches and projects their safe location evidence through the public ABC view. Nine are exact SanGIS address-point matches; the tenth is an exact County Assessor situs match for 3088 State Street whose coordinate is explicitly labeled as a parcel centroid:

- `public.properties`: 0 rows
- `public.addresses`: 0 rows with coordinates (the table is empty)
- `ingest.abc_property_candidates`: 0 rows
- reviewed point locations persisted in Supabase: 10
- verified parcel/building matches: 0

The explorer lists all 23 grouped activities and displays ten reviewed location markers. Seven remaining ABC candidates and the numbered Salt | Grass project address are labeled `Address available`; selecting one performs a user-triggered address lookup and shows a temporary search marker without treating it as reviewed parcel evidence. The other five projects remain `Location pending` because their current records provide only an intersection, corridor, city, or unverified location. County point/APN and parcel-centroid matches are explicitly not presented as verified suites, buildings, tenants, or openings. See the [pilot report](../research/carlsbad-poc/apn-match-pilot.md).

## Nearby search and privacy

Address lookup is submit-only (no autocomplete) and uses the public OpenStreetMap Nominatim endpoint. Catalog and explorer cards deep-link by internal record ID; they do not place the address in the URL. When a record lacks a reviewed point but has a numbered current address, the explorer strips suite/unit text before submitting that address to Nominatim, flies to the result, and labels it as unverified. The submitted address is not stored by this application. Geographic distance uses the Haversine formula against reviewed record coordinates only.

The public Nominatim service is acceptable only for moderate, user-triggered searches, with an absolute application-wide maximum of one request per second. Before material traffic, move the endpoint behind a replaceable caching proxy or select a production geocoder with an SLA. Do not use public Nominatim for batch geocoding the record backlog.

## Property relationship model

The map adapter is designed to evolve toward:

```text
Address → Parcel/APN → Property → Building → Tenant/suite → Activity/evidence
```

A marker should be used for a verified point when a building match is not reviewed. A building geometry should be highlighted only after a reviewed match records its source, method, confidence, and evidence. Multiple activity records may then be grouped beneath the same property/building panel.

## Next data step

The reviewed location workflow is now persisted with coordinate provenance, APN, match method, confidence, review note, and review timestamp. The next functional milestone is reviewed parcel polygons and building-footprint matching for the seven remaining ABC candidates and six development projects.


## Mobile split explorer (October 2026)

Mobile (up to 800px, plus short coarse-pointer landscape viewports) uses a true
map/card split: Browse 50/50, Explore 65/35, Details 20/80. Drag the dedicated
handle or use the three mode buttons; the handle also supports arrow keys and
Home/End. The MapLibre canvas follows its container with ResizeObserver,
coalesced to an animation frame. Dynamic viewport units and safe-area insets
keep browser chrome and home indicators out of the controls.

The carousel uses native overflow scrolling and CSS snap points for touch
momentum. A small mouse-drag adapter, previous/next buttons and arrow keys
provide other input paths. Selection is shared by card settling, card clicks
and marker clicks. A programmatic target suppresses intermediate scroll
selections; selecting an already active card does not restart its mobile camera
flight. Camera movement preserves bearing and pitch, uses a bounded zoom, and
stops animating when reduced motion is requested. Markers use a larger radius
and darker ring for active selection. The map occupies a separate grid row, so
camera centers are never hidden behind the cards.

Mobile selection never geocodes an unlocated record. Explicit address search
continues to use Nominatim. Existing `?focus=signal:…` and `?focus=project:…`
links activate the matching card without filtering away its neighbors. Full
record details open in a native dialog; closing it retains selection, scroll,
filters, panel size and camera. Source links open separately. No images, dates,
building associations or opening outcomes are synthesized. Current source
models do not provide project imagery or verified project-to-building polygons;
3D buildings remain geographic context, with selection on reviewed point markers.

The desktop sidebar and address form remain in their existing layout. Browsers
without WebGL2 can still browse records and open evidence; the map area explains
the limitation instead of aborting record loading.

### Verification

`npm test`, `npm run typecheck`, and `npm run build` are the baseline checks.
`node tests/browser/mobile-explorer.mjs` runs the Chromium mobile-emulation
suite after `npx playwright-core install --with-deps chromium`. The script starts
Vite with dummy credentials and intercepts all Supabase, map style and geocoding
requests. It uses real MapLibre rendering with a fixture background; it does not
contact or mutate production data. Coverage includes five actual touch swipes,
camera and highlight assertions, a rendered marker tap, vertical panel dragging,
partial-panel swipes, details return, absent coordinates/images, filters, empty
results, address search, focus deep links, narrow and rotated viewports, reduced
motion, desktop sidebar behavior and missing-WebGL recovery. CI uploads
screenshots as `mobile-explorer-screenshots`.

This is browser emulation, not physical iPhone/Android or Safari validation.
Native rubber-banding varies by browser. Haptics are intentionally omitted;
there is no animation dependency or unsupported frame-rate claim. The existing
MapLibre production chunk still triggers Vite's bundle-size advisory.
