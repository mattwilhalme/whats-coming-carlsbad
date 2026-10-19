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
