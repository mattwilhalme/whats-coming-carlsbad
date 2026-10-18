# 3D map explorer

The explorer is built from `explore.html`, `src/explore.ts`, and the reusable transformations in `src/map-data.ts`. It intentionally keeps records without verified coordinates in the evidence list instead of placing approximate markers.

## Basemap and 3D buildings

- Provider: [OpenFreeMap](https://openfreemap.org/) using the public Liberty style.
- Client: MapLibre GL JS, pinned and bundled by Vite rather than loaded from a runtime script CDN.
- Cost: the hosted public OpenFreeMap instance is currently free, permits commercial use, requires no API key, and states that it has no map-view/request limit. It does not provide an SLA; self-hosting remains the fallback.
- Building heights: the extrusion layer uses `render_height`, then `height`, and finally a clearly defined 10-meter fallback. Base height uses `render_min_height`, then `min_height`, then zero.
- Degraded mode: if the style has no compatible `building` source layer, the 2D basemap and activity markers/list remain usable.

## Current mapping coverage (audited 2026-10-17)

The public Supabase views contain 23 current ABC rows at 17 distinct addresses and 6 development projects. The frontend groups duplicate license types into 17 business activities, producing 23 activity cards in total.

Production Supabase still has no populated property or coordinate rows. A committed, read-only SanGIS pilot now supplies nine reviewed address points and unique APN candidates to the frontend:

- `public.properties`: 0 rows
- `public.addresses`: 0 rows with coordinates (the table is empty)
- `ingest.abc_property_candidates`: 0 rows
- reviewed point locations in the frontend pilot: 9
- verified parcel/building matches: 0

The explorer lists all 23 grouped activities, displays nine reviewed address-point markers, and leaves eight ABC candidates plus all six development projects as `Location pending`. A SanGIS point/APN match is explicitly not presented as a verified suite, building, tenant, or opening. See the [pilot report](../research/carlsbad-poc/apn-match-pilot.md).

## Nearby search and privacy

Address lookup is submit-only (no autocomplete) and uses the public OpenStreetMap Nominatim endpoint. The submitted address is not stored by this application. Geographic distance uses the Haversine formula against verified record coordinates only.

The public Nominatim service is acceptable only for moderate, user-triggered searches, with an absolute application-wide maximum of one request per second. Before material traffic, move the endpoint behind a replaceable caching proxy or select a production geocoder with an SLA. Do not use public Nominatim for batch geocoding the record backlog.

## Property relationship model

The map adapter is designed to evolve toward:

```text
Address → Parcel/APN → Property → Building → Tenant/suite → Activity/evidence
```

A marker should be used for a verified point when a building match is not reviewed. A building geometry should be highlighted only after a reviewed match records its source, method, confidence, and evidence. Multiple activity records may then be grouped beneath the same property/building panel.

## Next data step (requires approval)

The next functional mapping milestone requires a reviewed, persisted geocoding/matching workflow. That will likely add parcel/building identifiers, coordinate provenance, geometry source, match method, confidence, and review timestamps to curated tables/views. Because that is a production schema and data change, it must be proposed and approved before implementation.
