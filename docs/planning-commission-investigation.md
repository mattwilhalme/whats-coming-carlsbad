# Planning Commission ingestion investigation — October 19, 2026

## Outcome

A conservative document ingestion pipeline is implemented and tested. Two official Fairfield documents were imported into the existing project without creating another project. **The complete success criterion is not met:** automatic city meeting discovery is blocked by HTTP 403, and neither the September 16 nor October 7 meeting agenda/packet/minutes was retrieved. Do not interpret this deployment as verified full meeting coverage.

## Baseline and root causes

Repository baseline: `88085fc3f6b2c04055704e140761734a673fd67b` (`main`). There was no Planning Commission collector, PDF parser, ingestion command, or Actions workflow. The October 19 planning-document migration implemented an evidence model and manually reviewed Salk Avenue document; it was not an automated scraper. The existing expansion note explicitly documented city HTTP 403 and deferred a city scraper.

Production Supabase project: `unzxzlwhkoypkbnodzfy`. Six projects existed. Fairfield's existing row was `fairfield-apartments-bressi-ranch`, with 320 homes, 43 affordable homes, status `CEQA exemption posted`, date October 9. No project identifiers were populated. There were no Edge Functions and no `cron.job` relation. Recent Actions runs covered ABC, County/DEHQ and Pages, with no Planning Commission run.

| Stage | Finding | Action |
| --- | --- | --- |
| Discovery | No implementation; city index returns 403 in HTTP client, web retrieval and browser | Added bounded index discovery, explicit failure reporting, and an official-document manifest fallback |
| Download | No planning downloader; CEQAnet PDFs use redirects and extensionless attachment URLs | Added checked HTTPS redirects, host allowlist, response size/time limits and PDF signature validation |
| PDF extraction | No planning extraction implementation | Added Poppler embedded-text extraction, Unicode normalization, numbered pages and per-document failures |
| Classification | No agenda-item classifier | Extract case/APN candidates and retain text for review; do not publish unsupported outcomes |
| Matching | No planning matcher or populated case identifiers | Match known names and available case IDs; conflicts/multiple project packets remain pending |
| Persistence | Existing evidence schema only; no scheduled writer | Added atomic service-only reviewed-document RPC and private run logs; preserves catalog fields |
| Operations | No planning schedule | Added daily Actions workflow, reports and failure artifacts; blocked discovery makes the run fail visibly |

## Documents processed

Official source page: https://ceqanet.lci.ca.gov/2026100315

| Document | Pages | SHA-256 | Evidence |
| --- | ---: | --- | --- |
| [CEQA exemption evaluation checklist](https://ceqanet.lci.ca.gov/2026100315/Attachment/vWzhlR) | 17 | `e17f9be3ff436de73adecf5428c319c40324d3da18160eadf5c915c4944dde85` | Page 1: project identity, SDP 2024-0009, printed APNs `213-263-19, -20`, location. Page 2: 320 homes, 43 affordable homes |
| [Notice of Exemption](https://ceqanet.lci.ca.gov/2026100315/Attachment/mpHQ15) | 1 | `7792ead26e0b158fccd54b24ed039a6a8360c0cd6bd71b3fcfcdb1eb06c3a629` | Page 1: project identity, location, unit counts and exemption. Signed October 9; posted October 9 according to official source page |

Both first pages were rendered and visually inspected. The checklist cover says September 16, 2026. That is not evidence that it was heard on that date; its PDF metadata was created October 8. The NOE's embedded text misreads `SDP` as `SOP` and omits the handwritten signature date; those are reasons to retain visual review. No approval date was inferred from the form's approving-agency label.

## Production changes reviewed and applied

Added a private `ingest.planning_ingestion_runs` table and two service-role-only `SECURITY INVOKER` functions. No anonymous write access was added. RLS is enabled on the run log, without public policies by design. Security advisors show informational no-policy notices for private service-only ingestion tables; no warning/error findings were returned.

Imported two reviewed document records and nine claims into Fairfield's existing project. Added one `ceqa_exemption_posted` event dated October 9 with the official PDF URL, page citation, explanatory review note and discovery timestamp. Preserved existing project status, source, location and unit fields. The earlier Salk document and seven claims remain unchanged.

New projects created: **0**. Existing projects enriched: **1**, Fairfield. Catalog remains **6 projects**. Document/claim totals become **3 documents / 16 claims**.

## Tests

- 34 automated tests pass, including 14 new planning tests. Existing collectors and map tests are included explicitly in the npm test command.
- Production frontend build passes. Existing large MapLibre bundle warning remains.
- Live source tests downloaded both official attachments, verified hashes, extracted 18 pages and matched the existing Fairfield row.
- An initial database rehearsal ran as `service_role` inside a rolled-back transaction.
- Two successive imports returned no additions on the second pass: `document_added=false`, `claims_added=0`, `events_added=0` for both PDFs. Repeating after the committed import also returned zero additions.
- Source failures are retained separately from document parsing failures. A failed PDF does not prevent a subsequent valid document from processing.

## Pending review and limitations

1. September 16 and October 7 full agendas, packets, staff reports, minutes and attachment inventories remain unverified because the city denies access from this environment. No meeting-specific approval, continuance or denial was written.
2. Automatic new-project creation is deliberately not enabled. Unknown candidates are retained in private run reports and artifacts; no tested real agenda item was available to validate safe title/location extraction. This needs a later implementation and review.
3. Multi-project packets are held for item-level review. The existing planning_documents schema links a PDF to a single project, so silently assigning an entire packet would be unsafe.
4. APNs are retained as printed; shortened parcel suffixes are not silently expanded into canonical parcel identifiers. Owner/applicant/agency mailing addresses are not treated as project addresses.
5. The parser does not OCR scanned PDFs, recognize PDF attachment annotations, follow meeting-detail HTML links, or infer decisions from votes/minutes. Such files need additional extraction/review support.
6. Only checksum-bound, page-verified manifest claims and reviewed milestones publish. Updating a reviewed source requires re-review. Existing claims are not overwritten automatically.
7. One document is atomic, but a run is intentionally not all-or-nothing: successful documents survive a different document's failure.
8. The daily workflow is scheduled for 18:45 UTC (11:45 a.m. PDT / 10:45 a.m. PST). A push run verifies deployment, not execution of a future cron trigger. GitHub Actions schedules may drift.

## Operation

`npm run planning:dry-run` reads the production catalog with Supabase credentials and writes a concrete plan/report to `artifacts/planning/`. `--catalog <json>` supplies `{projects,identifiers}` for an offline catalog. `npm run planning:ingest` applies only reviewed existing-project evidence. `--manifest <json>` selects an alternate reviewed source manifest.

Workflow runs store the report in the private database run log and upload 14-day artifacts. Discovery HTTP failures produce a nonzero exit even if fallback documents succeed; they must not be mistaken for complete agenda coverage. Workflow dispatch defaults to dry-run; scheduled and main push runs apply only the checked-in reviewed manifest.

## Deployment evidence

- Implementation commit: `b1399a7d141c3b943e9e532cf1c7700b30d4da41`.
- Merged [PR #6](https://github.com/mattwilhalme/whats-coming-carlsbad/pull/6) into main as `674ff0027e1c0ddc7dc83f63d3d6dcc83976b829`.
- [First deployed ingestion run](https://github.com/mattwilhalme/whats-coming-carlsbad/actions/runs/39357546488): 34 tests passed; both live PDFs processed and persisted with zero new additions; city discovery returned HTTP 403; overall job correctly failed for incomplete discovery.
- [Diagnostic artifact](https://github.com/mattwilhalme/whats-coming-carlsbad/actions/runs/39357546488/artifacts/12236026147): plan and report uploaded successfully.
- Database run log: `3c928759-c969-4f9f-b3e5-3409261d65ba`, started October 20 at 02:11:36 UTC (October 19 at 7:11 p.m. Pacific), mode `apply`. Both document persistence results report `document_added=false`, `claims_added=0`, `events_added=0`. No run-log error.
- [Website deployment](https://github.com/mattwilhalme/whats-coming-carlsbad/actions/runs/39357546449) succeeded.
- The daily schedule is installed, but a future `schedule`-triggered execution has not yet been observed. This deployment verifies execution on a main-branch push, not future cron delivery.

The remaining blocking dependency is an accessible official meeting index/document feed or reviewed source manifests for the two meeting packets. Once available, item segmentation, OCR when needed, outcome extraction and reviewed new-project creation still require implementation and live validation. This report does not claim those steps are complete.
