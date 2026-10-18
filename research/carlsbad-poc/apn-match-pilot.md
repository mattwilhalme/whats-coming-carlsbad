# SanGIS address-point/APN pilot

Reviewed 2026-10-17 against the public SanGIS Address Points to APN FeatureServer. Matching requires exact normalized street-address equality. A unique result verifies an address point and parcel candidate only; it does not verify a suite, building footprint, tenant identity, ownership, or opening outcome.

Source: https://gis-public.sandiegocounty.gov/arcgis/rest/services/sdep_warehouse/ADDRAPN/FeatureServer/0

## Unique address-point/APN candidates

| Business signal | Address | APN | Longitude | Latitude |
|---|---|---:|---:|---:|
| 264 Fresco | 264 Carlsbad Village Dr | 2032321600 | -117.35167718387284 | 33.15814050645088 |
| Blue Ocean Privateers Ltd | 2609 Sutter St | 1675113100 | -117.31331169152601 | 33.16150620119606 |
| Blue Ocean Sushi | 2958 Madison St | 2033032400 | -117.34685037689230 | 33.16152347013818 |
| Dozier Imports LLC | 2225 Camino Vida Roble | 2130502400 | -117.27276972545451 | 33.11852833189627 |
| Grimo | 2727 Roosevelt St | 2031013400 | -117.35008754023919 | 33.16270483899926 |
| Kura Revolving Sushi Bar | 5970 Avenida Encinas | 2101702200 | -117.32415801274942 | 33.12400155866187 |
| L'Atelier de Paris | 7150 Avenida Encinas | 2144302400 | -117.31167530827456 | 33.10038199772733 |
| Sushi Kuchi Carlsbad | 7180 Avenida Encinas | 2144301900 | -117.30959853091586 | 33.10036265018028 |
| Vino Norte | 2225 Camino Vida Roble | 2130502400 | -117.27276972545451 | 33.11852833189627 |

Dozier Imports LLC and Vino Norte share the same street address and parcel candidate. Their suite strings also normalize to 100, but the address-point source does not establish tenant identity; both remain separate ABC signals.

## Unmatched candidates

- Billboard Beverages — 2235 Faraday Ave, Suite Q
- Boots & Beer — 1911 Calle Barcelona, Suite 157
- Country Marketplace — 4625 Garden Hill Loop, Suites B1 & B2
- Crackheads — 430 Carlsbad Village Dr
- Emerald Spirits Beer & Wine — 2612 El Camino Real
- F-86 — 5933 Sea Lion Pl, Suite 108
- Napatini — 3088 State St, Suite 100
- Slice House by Tony Gemignani — 6943 El Camino Real, Suites 101 & 103

Unmatched means the exact normalized street string did not resolve in this run. It does not mean the address or business is invalid; aliases, unit-address records, and source formatting still require review.
