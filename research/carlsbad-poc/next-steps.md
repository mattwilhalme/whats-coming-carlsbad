# Next steps

## Recommendation

Proceed with a narrow, source-transparent MVP. The product can be useful for project timelines and license-based tenant leads. It cannot promise complete current construction-permit coverage using the discovered ArcGIS service.

## Priority roadmap

1. **Obtain a current city permit source.** Send the ArcGIS item ID, observed 2023 cutoff and desired fields to Carlsbad GIS/Community Development. Ask whether a replacement FeatureServer, Accela endpoint or scheduled export exists.
2. **Productionize ABC snapshots.** Run weekday ingestion, retain file metadata, group duplicate license types and create status-change events. Display “ABC application pending,” never “opening soon,” without corroboration.
3. **Add County monthly snapshots.** Keep facility identity and permit state. Exclude owner phone/email and avoid publishing personal owner names.
4. **Create CEQAnet collector.** Filter by City of Carlsbad lead agency, link SCH/SDP/CDP identifiers and retain attachment URLs. Add manual review for project merges.
5. **Resolve city planning and business-license access.** Ask for permitted structured access. Keep manual review until then; do not automate around HTTP 403.
6. **Build property identity.** Start with normalized address + suite, then add verified APNs and coordinates. Model shopping centers and multi-parcel developments explicitly.
7. **Manual validation pilot.** Review all 17 pending ABC candidates and at least 50 high-value commercial permit descriptions. Record false positives and rule changes.
8. **Only then add public pages.** Show source event dates, retrieval dates, confidence, and the difference between proposed, approved, permitted, under construction and completed.

## Operational cost

Expected **incremental infrastructure cost: $0/month** for a Carlsbad-only prototype if existing free allowances are available and raw snapshots stay compact.

- Supabase Free currently includes a 500 MB database, 5 GB egress plus 5 GB cached egress, and 1 GB file storage. A normalized Carlsbad dataset should fit initially, but raw daily statewide ABC files should remain in short-retention CI artifacts or compressed object storage rather than the database.
- GitHub Free includes 2,000 Actions minutes and 500 MB Actions/artifact storage per month for private repositories; standard runners are free for public repositories. A few short Node collectors should fit if downloads are cached and raw retention is bounded.
- A production reliability upgrade is likely **$25/month** for Supabase Pro before traffic requires it. Domain, monitoring and long raw-data retention are separate costs.

These are current public list limits as of 2026-10-14 and can change. Set usage budgets and alerts before scheduling.

## Main blockers

- Stale city building-permit feed.
- Automated 403 responses from city planning and business-license pages.
- No verified parcel/geocoder source in this POC.
- ABC and food data reveal licensing identity but not planned opening dates.
- Manual review remains necessary for suites, transfers and multi-license businesses.

## Go/no-go criteria for the next phase

Go if the product is framed as “public records and evidence-backed signals for this address.” Pause if the value proposition requires comprehensive same-week construction activity, confirmed tenants, or reliable opening dates without city cooperation.
