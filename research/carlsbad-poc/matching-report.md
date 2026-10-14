# Matching report

## Counts

- ArcGIS permits retrieved: 9,886.
- Non-residential permits classified: 745.
- Non-residential permits in the current 90-day window: 0. The layer ends on 2023-12-29.
- California ABC Carlsbad rows: 501.
- Pending ABC application rows: 23, collapsed to 17 file/address candidates after grouping duplicate license types.
- County food-facility rows in Carlsbad: 602.
- Pending ABC candidates with an exact normalized street-address and overlapping County facility name: 2.
- Apartment/mixed-use/commercial seed records normalized: 6.

The commercial-permit business-identification percentage is calculated as:

`historical non-residential permits with at least one ABC DBA or County facility at the same normalized street address / 745 historical non-residential permits`

The result is **115 / 745 = 15.4%**. The generated `raw/run-metrics.json` contains the machine-readable numerator and rate. This is an address-level candidate rate, not a confirmed tenant-match rate. Confirmation requires suite, permit description, business name and time alignment.

## Manually reviewed tenant examples

- **264 Fresco, 264 Carlsbad Village Drive:** pending ABC application plus County facility at the same normalized street address with overlapping business name. Strong candidate for an identity link, but it may represent a transfer or relicensing of an existing operation.
- **Blue Ocean Sushi, 2958 Madison Street, Suite 100:** pending ABC application plus County facility at the same street address with overlapping name. Strong identity candidate; pending status is not evidence of a future opening.
- **Kura Revolving Sushi Bar, 5970 Avenida Encinas:** direct pending ABC application. No independent exact-address County match in this extract, so it remains possible and requires review.
- **Slice House by Tony Gemignani, 6943 El Camino Real, Suites 101 & 103:** direct pending ABC application. Requires city permit or business-license corroboration.
- **Boots & Beer, 1911 Calle Barcelona, Suite 157:** direct pending ABC application. Suite-level identity is available, but issuance/opening remains unverified.

The remaining candidate rows are in `tenant-candidates.csv`; blank DBA values fall back to the legal organization name.

## Join method

1. Uppercase and remove punctuation.
2. Standardize common street suffixes.
3. Preserve suite separately for candidate review.
4. Group ABC duplicate license types by file number plus premise address/suite.
5. Treat exact street-address equality as a candidate link only.
6. Upgrade to `strong_candidate` only when a County facility at that address also has an overlapping facility/DBA name.

## Failure modes

- A shopping-center street address can represent many unrelated tenants.
- Suite formats vary (`STE 100`, `#100`, embedded in address line 1).
- ABC application rows may be transfers, duplicate license types, existing businesses or abandoned applications.
- Food permits are usually active-facility evidence, not a “coming soon” signal.
- The permit layer is historical, so even a correct address match may be years apart.
- Permit descriptions often omit trade names.
- Address aliases, parcel-based projects and multi-parcel sites need a separate property-identity layer.

## Sampling limit

The five examples above were manually inspected. All 17 candidates were generated deterministically, but the POC did not manually verify every record against city documents. No output row is labeled confirmed. The source limitations prevented the target of five confirmed cross-source matches.
