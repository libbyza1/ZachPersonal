# FWN Validations Test Function 4 Terminal

## Current implementation guide (2026-10-01)

This guide describes the current code. Scope, original requirements, measurable
success criteria and acceptance gaps are maintained in [project.md](../project.md).
The dated implementation history below is retained for traceability, not as a
current runbook. In particular, older two-water-class scope, excluded categorical
tests, standalone mean/source-age KPI descriptions, and statements that no live
Refresh exists are superseded by this guide. Historical counts and test results
apply only to their recorded snapshots and runs.

### Architecture and file ownership

| Component | Responsibility |
| --- | --- |
| [output/index.html](../output/index.html) | Dashboard markup, responsive style overrides, `DASHBOARD_CONFIG`, and inline `terminal-logic` controlling utility/audit filtering, charts, metrics, tables, details and exports. |
| [output/assets/js/core.js](../output/assets/js/core.js) | Shared Echelon initialization and theme behavior. |
| [output/assets/js/charts.js](../output/assets/js/charts.js) | Shared chart runtime; this dashboard overrides `_buildTabs` and implements its own trends in the HTML. |
| [output/assets/css/dashboard.css](../output/assets/css/dashboard.css) | Shared Echelon styles; local vendor assets supply ApexCharts 3.54.1, Tabulator 5.5.0 and PapaParse 5.4.1. |
| [output/data/water-results.json](../output/data/water-results.json) and [output/data/water-results.js](../output/data/water-results.js) | Utility results, linked criteria and extraction metadata; JS exposes `window.FWN_WATER` for static-file loading. |
| [output/data/cycle-audits.json](../output/data/cycle-audits.json) and [output/data/cycle-audits.js](../output/data/cycle-audits.js) | Sample-level audit results, issues and metadata; JS exposes `window.FWN_AUDITS`. |
| [scripts/serve_dashboard.py](../scripts/serve_dashboard.py) | Loopback HTTP server, read-only Athena queries, refresh validation, staged publication and rollback. |
| [scripts/import_results.cjs](../scripts/import_results.cjs) | Utility result/criteria transformation and snapshot generation. |
| [scripts/cycle_audits.py](../scripts/cycle_audits.py) | Audit result normalization, sample deduplication, equipment classification, issue handling and snapshot generation. |
| [water-results.sql](water-results.sql), [acceptance-criteria.sql](acceptance-criteria.sql), [cycle-audits.sql](cycle-audits.sql) | Production extraction queries with history/date placeholders supplied by the service. |
| [system-counts.json](system-counts.json), [cycle-audit-counts.sql](cycle-audit-counts.sql), [cycle-audit-counts.json](cycle-audit-counts.json) | Independent reconciliation evidence, valid only for matching snapshots. |

The page loads local vendor libraries, shared Echelon utilities/filters/core/charts,
then both snapshot bundles, then the inline application logic. `DashboardCore.init`
sets up the shared page; `DashboardCharts.init` invokes the custom utility setup.
Utility and audit navigation then control a single visible region. The nested
`output/assets/assets/` copy and older monthly JSON bundles are not the active
application entry points and should not be mistaken for the current data source.

### Utility workflow and calculations

- Seven alphabetically labeled utility choices preserve separate system scopes.
	Per-utility state retains locations, test/unit, dates, month, release flag and
	date basis during navigation. Initial selection is WFI; reset dates are today
	minus two calendar years through today, with leap-day adjustment.
- `selectRows` applies utility, location, test/unit, release and date-basis filters,
	then the date window. `render` applies month selection. Monthly counts use the
	whole selected date range, while metrics, trend and table follow the month.
- Default dates prefer collection timestamp, otherwise LIMS event timestamp.
	Collection-only mode excludes event-only records; creation date is never a
	fallback. ISO source calendar dates are preserved without an unverified timezone
	conversion. Extraction timestamps are displayed in UTC.
- Numeric scatter series distinguish sampling locations and exact results versus
	reported bounds. Nitrates, Coliforms, Color and Clarity use source-text category
	lanes. Missing results do not become zero; censored results are excluded from
	exact-value means. Multiple locations are pooled for historical means.
- Current headline metrics are Latest result and Recorded results, accompanied
	by source details, prior-result variance for the same location, recorded fraction,
	missing count and censored count. The quality band reports source age/date gaps;
	a separate section displays linked acceptance criteria, not a calculated verdict.
- WoW/MoM/QoQ/YoY compare trailing 7/30/90/365-day exact-result means with the
	preceding equal windows ending at the selected end date. They do not follow
	the month filter. Missing exact data yields N/A; utility comparisons do not
	independently guarantee complete source coverage for each window.
- Point selection highlights its source table row and opens details. Table actions
	provide a keyboard-accessible alternative; drill-through isolates the location.
	Right-click hiding affects only the utility trend and auto-fits axes. Restore
	clears all hidden IDs for that utility; reload/successful refresh also clears them.

### Audit workflow and decisions

- Separate Sterilizers and Ovens selectors use numerically ordered equipment and
	all-equipment choices. Each group retains its dates; equipment changes clear the
	month. Equipment classification uses the cycle-number prefix, not the unreliable
	equipment attribute. Prefixes 18, 29 and 32 are ovens.
- One eligible sample ID is one audited cycle, across request methods. Only
	released nonblank PASS/FAIL outcomes count; agreeing duplicates collapse.
	Conflicting outcomes/dates, unresolved prefixes and missing dates are excluded
	with provenance, rather than silently choosing a result. Cancelled/template
	samples and unrelated CIP/SIP requests are excluded by the extraction rules.
- Trend dates use the recorded TEST DATE result linked by sample/method/version/
	variant/dataset/replicate. Do not derive dates from creation time or cycle text.
- Sterilizer content buttons normalize only case and whitespace. Blank content
	is Not supplied; differing wording is not merged. `contents: null` means all,
	`contents: []` means none. Choices cover equipment history, not just the selected
	dates, and are remembered per equipment within the page session. Explicit
	selections are pruned to available contents when rebuilding after refresh.
- `auditRows` drives equipment/content/date/month selection. `auditSummary`
	computes failed, passed, total and failed/total * 100. A zero denominator yields
	N/A. Pass/Fail scatter lanes and stacked monthly counts reflect recorded outcomes,
	not newly evaluated process acceptance. Same-day points may overlap.
- Monthly bars retain the full selected date-range counts. Month selection scopes
	summary, trend and table. Header filters additionally scope downloads, without
	changing the headline denominator. Details drill through to the equipment.
- Failure-rate change compares the selected period with its preceding equal-length
	period; a month filter or incomplete historical baseline yields N/A. Historical
	7/30/90/365-day changes use percentage points and ignore month selection. The
	metadata history boundary is checked, but is not proof of sampling completeness.

### Shared behavior and exports

Both workflows offer ISO dates, range sliders, month selection, clear/reset actions,
paginated Tabulator tables, modal provenance and CSV/JSON exports of active table
rows across all pages. CSV formula escaping is enabled; JSON preserves snapshot
metadata, selections and source identities/criteria. Header filters do not alter
chart totals. Utility and audit tables have different column layouts; horizontal
table scrolling on mobile is distinct from unwanted page-level overflow.

Themes redraw charts; responsive styles stack charts and insight sections below
800 pixels. Info controls expose definitions; focus indicators and Escape dismissal
support keyboard use. Observations describe outcomes, assumptions qualify the
evidence, and recommendations avoid inferring root causes or compliance.

### Running and refreshing

For an offline snapshot, open [output/index.html](../output/index.html) directly.
The page reads bundled data; opening/reloading it does not query production.
The Refresh button reports that a local service is needed in file mode.

For local refresh, use an environment with Node.js and Python 3.9 or later
(the service uses `Path.is_relative_to`). Install the pinned Python dependencies
from [scripts/requirements.txt](../scripts/requirements.txt) when setting up:

```powershell
python -m pip install -r scripts/requirements.txt
```

Run these commands from the Project 1 directory:

```powershell
.\run_dashboard.bat
```

The launcher prefers the parent workspace's `.venv` interpreter, otherwise `python`.
Ensure dependencies are installed in that same interpreter. It starts at port 8765
and tries the next 19 ports if occupied. Open the printed `http://127.0.0.1:PORT/`
URL, not a guessed port or `localhost` alias; Host validation is strict. An explicit
starting port can be supplied with `.\run_dashboard.bat --port 8770`.

Production Refresh requires an authorized AWS session under profile `foresight`,
region `us-east-1`, with the relevant Athena/catalog/S3 permissions. Keep credentials
outside source files and exports. Queries use a three-year history ending today.

1. The browser gets a process-local token from `GET /api/status`, then sends
	 `POST /api/refresh` with `X-FWN-Refresh`. The service checks Host, Origin and
	 token, and rejects overlapping refreshes with HTTP 409.
2. The service queries utilities, specifications and audits read-only, paginates
	 Athena results, validates nonempty usable datasets, and stages transformed files.
	 Individual Athena queries have a 240-second deadline; import has a 120-second
	 subprocess timeout.
3. Publication replaces both JSON/JS snapshot pairs and extraction evidence under
	 the data lock. Caught publication I/O failures trigger backup restoration. This
	 is local locking/rollback, not a crash-proof multi-file database transaction.
4. The response supplies both snapshots; the page rebuilds views, preserves utility
	 filter selections and audit state where supported, clears temporary graph hides,
	 and updates timestamps/status. Table header filters and row selections are not
	 preserved by rebuilding tables. Query/validation failures leave prior files intact.

When served by the local service, opening or reloading the page renders the
published snapshot first, then automatically runs the same Refresh flow. File-mode
viewing still never queries production.

If Athena reports an expired/invalid AWS session (`ExpiredTokenException`,
`ExpiredToken`, `InvalidClientTokenId`, `UnrecognizedClientException`,
`RequestExpired`) or no credentials exist, `/api/refresh` returns HTTP 401 with
`authRequired` and the service starts the production Okta SAML verification in
[scripts/okta_login.py](../scripts/okta_login.py): it opens the `alcon.okta.com`
Foresight Analytics app, captures the SAML POST on `127.0.0.1:7890`, assumes
`Athena-LakeFormation-OktaRole` (Lake Formation, falling back to STS) for 12 hours,
and writes profile `foresight` to `~/.aws/credentials`. The page polls
`GET /api/auth` and retries the refresh once after verification completes. Port
7890 conflicts, a 5-minute timeout, or a failed role assumption leave the prior
snapshot in place. Other AWS errors (for example access denied) return HTTP 502
without starting Okta. `python scripts/okta_login.py` renews credentials manually.

`GET /api/data` returns the utility snapshot only. Static audit data comes from its
bundle; the combined refresh response includes audits. The service binds only to
loopback and serves the output tree; it is not a multi-user authenticated deployment.
No scheduled refresh is implemented; refresh runs when the served page is opened or
Refresh is selected. A successful refresh does not automatically
regenerate the independent production-count reconciliation artifacts.

### Limitations and acceptance gaps

- No licensed USP-NF verification, regulatory release determination, or site system
	qualification is provided. Source specification labels, historical versions and
	warning bands are reproduced as stored, not consolidated into universal limits.
- Event dates are not verified collection dates. Missing dates, excluded audits,
	absent tests and partial baseline windows prevent completeness claims. Recorded
	percentages use selected rows, not a supplied sampling-plan denominator.
- KPI targets are not supplied. Not every KPI has its own target/variance/trend;
	comprehensive cross-highlighting and validated outlier rules remain gaps against
	the preserved original requirements. XML/Parquet remain conditional requests.
- Filter state is session-local, not a saved user preference across reloads.
	Temporary graph hiding is not deletion or a persisted quality disposition.
- Formal accessibility testing remains outstanding. Touch users do not have a
	dedicated equivalent for the right-click graph-hide action.
- Protect local snapshots, downloads, reference workbooks, evidence and screenshots
	as production laboratory data. Public hosting or public GitHub publication is
	not an approved deployment assumption.
- Historical verification reports a full-suite mismatch: expected 3,438 nonmissing
	endotoxin rows versus 3,440 in that snapshot. The full verifier still contains
	the fixed 3,438 assertion. Reconcile evidence before changing expectations;
	a focused pass is not a full-suite pass.
- The browser audit verifier contains snapshot-specific fixtures (September 2026,
	named equipment/content and Oven 32 totals). Update those deliberately with
	refreshed evidence when data or the rolling two-year window changes.

### Verification procedure

From Project 1, use the interpreter containing the pinned dependencies:

```powershell
node scripts/verify_dashboard.cjs --audit-only
node scripts/verify_dashboard.cjs --graph-only
node scripts/verify_dashboard.cjs
python -m unittest discover -s scripts -p test_refresh.py
```

- `--audit-only`: audit identity, release/outcome eligibility, equipment/content/
	date/month isolation, summary/empty behavior and JSON/JS parity. Independent
	audit counts are checked only when their snapshot query ID matches; inspect
	this condition instead of interpreting a skipped comparison as reconciliation.
- `--graph-only`: also checks utility reconciliation, navigation definitions,
	filtering, dates and graph hiding/restore with stubbed chart/DOM objects. It
	does not prove actual browser rendering, and returns before later full checks.
- Full Node verifier: additionally checks censored/categorical data, criteria,
	assets and utility bundle parity, but stops at its first failed assertion.
	Renew independent evidence after refreshing; do not bypass mismatches to claim
	success. Old dated counts in the history below are not moving acceptance totals.
- Refresh unit tests: mocked query, pagination, timeout, eligibility, request
	protection, concurrent refresh rejection and publication/rollback behavior.
	They do not perform or certify a live production refresh.

For browser verification, start the local service first, then use its printed URL:

```powershell
python scripts/verify_cycle_audits.py --url http://127.0.0.1:8765/
```

This uses Playwright with installed Microsoft Edge, checks audit navigation,
content selection/retention, totals, dates/month/sliders, details, filtered exports,
empty states, theme and 1440 x 1000 / 390 x 844 layouts. It writes screenshots
under `docs/`. It does not trigger a production refresh.

Also manually verify all seven utility views, mixed-location exact/bound/category
series, collection-only mode, acceptance criteria, real-pointer graph hiding and
restore, modal Escape/focus, chart/table cross-filtering and exports. Inspect
desktop/mobile screenshots for nonblank charts, loaded branding, clipping and
overlaps; check console errors, contrast and keyboard operation. Test live refresh
only with authorized production access, then reconcile the new snapshot separately.

### Documentation maintenance and verification record

At a completed task, update this current guide if behavior, ownership, setup,
decisions, limitations or verification steps changed. Update `project.md` only
when scope/requirements/success criteria need to change, retaining original
requirements and explicitly identifying unresolved items. Keep significant dated
decisions and evidence in `docs/`; do not append a diary of intermediate edits.

The 2026-10-01 documentation update is based on source/script inspection. Earlier
test-pass statements below are historical evidence, not tests rerun for this
documentation-only update. No new production extraction or browser qualification
is claimed. Record actual commands, results, snapshot identity and any blockers
when performing the next implementation verification.

## Historical implementation and verification records

The following records are preserved. Use the current guide above for present
behavior and setup; older scope statements, counts and limitations may be superseded.

## Sterilizer cycle-content selections (2026-09-29)

Sterilizer audit views now offer cycle-content multi-select buttons using the
same pressed-state styling as utility sample-location buttons. All contents
are initially selected; **Clear All** allows selecting individual contents and
**Select All** restores the full equipment view. Zero selected contents produces
an empty view, not an implicit all-contents selection. Oven behavior is unchanged.

Content comes from the existing `Cycle_Description` sample attribute (shown as
Cycle contents in the source table). Grouping normalizes case and whitespace
only: Terminal, TERMINAL and Terminal with trailing spaces share one button.
Different words such as Component and Components remain distinct; there is no
unverified synonym mapping. Blank/null descriptions share **Not supplied**.
Original source text remains unchanged in details and downloads. Available
buttons cover the selected equipment's entire snapshot, independent of dates,
so adjusting the time window does not silently alter the selection.

Selections filter the Pass/Fail trend, monthly counts, failed/total summary,
historical comparisons, insights, source table and CSV/JSON exports through
the same sample-level filter. They never duplicate samples or mix in blank
audit results. JSON selection metadata includes normalized `contents`, with
null meaning all and an empty array meaning none. Selections are remembered
per sterilizer (including All sterilizers) during the page session and survive
date, theme and refresh changes. On refresh, unavailable explicitly selected
contents are removed; all-contents mode includes newly observed contents.

The existing audit verifier covers label normalization and single/multiple/all/
empty content filters. The browser verifier covers keyboard toggling, matching
chart/summary/table totals, content-filtered downloads, per-equipment retention,
Select All, empty state and mobile overflow. Screenshots are recorded as
`cycle-contents-desktop.png` and `cycle-contents-mobile.png`.

## Sterilizer and Oven cycle audits (2026-09-29)

Two additional native dropdowns, **Sterilizers** and **Ovens**, sit beside
Critical Utility. Equipment options are numerically ordered, with an all-equipment
option in each group. Only one utility or audit view is visible at a time.
Each audit group retains its date window when switching views. The initial
window is today minus two calendar years through today; the snapshot contains
three years of dated history for comparisons.

### Source evidence and decisions

- Production database: `adl_enriched_gbl_cf_qualytics_lvlims`, accessed read-only
	through Athena using the existing `foresight` profile.
- `cycle-audit-workbooks.json` inventories all reference workbooks. One export
	is empty. The two Sterilizer 3 35/30 and 35/40 exports overlap. The Sterilizer
	28 export has multiple cycle-request columns with mostly blank alternatives.
	Workbook values establish field mappings, not the production dashboard data.
- Audit fields are `CYCLE AUDIT` and `CYCLE RESULTS`. Oven/reference records use
	`PASS/FAIL CYCLE REQUEST`; Sterilizers can use multiple request methods.
- User correction on 2026-09-29: equipment is assigned from the **cycle-number
	prefix in `s_sample.sampledesc`**, not `Sterilizer_Num` or the request method.
	The previous attribute-based mapping disagreed with 134 included cycle prefixes.
	Prefixes **18, 29 and 32 are Ovens**; other readable equipment prefixes are
	Sterilizers. Both `32-24121815` and `32-24121819` therefore belong to Oven 32.
- Prefix parsing accepts one or two digits before the first hyphen, tolerates
	surrounding whitespace and normalizes leading zeroes (03 becomes 3). The
	suffix must be nonempty. Duplicate hyphens later in the cycle number do not
	change its prefix. Missing prefixes, placeholders and three-digit prefixes
	are flagged and excluded, with no fallback to the unreliable equipment
	attribute. The original attribute remains in sample details and downloads
	as reference-only provenance. No sample date is inferred from the cycle number.
- Audit records do not carry the utility collection/event dates. Trends use the
	typed `transformdt` on `TEST DATE` joined by sample, method, version, variant,
	dataset and replicate. Reference-linked production records verify this field
	against the workbook test date. Creation/modification dates are not cycle dates.
	Unverified timezone conversion is not performed on source calendar dates.

### Counting and failure prevention

1. Count one LIMS sample ID once, across all cycle types and duplicate requests.
	 A sample is the agreed counting unit; duplicate sample descriptions with
	 different sample IDs are not automatically merged.
2. Only released (`releasedflag = Y`), nonblank, exact PASS/FAIL audit results count.
	 Case and surrounding whitespace are normalized. Blank, N/A, CLEAR and other
	 text are not inferred to be passes or failures. Unreleased values are excluded
	 under the agreed finalized-result rule.
3. Agreeing duplicate outcomes collapse to one sample. Different current nonblank
	Pass/Fail outcomes, conflicting dates, or ambiguous cycle prefixes are flagged and
	 excluded instead of choosing an arbitrary request. The current result table
	 is used; no historical audit-attempt count is inferred. Latest modification
	 metadata is retained only among agreeing outcomes.
4. Failed cycles = unique included FAIL samples. Total audited = unique included
	 PASS + FAIL samples. Failure percentage = failed / total * 100. Empty periods
	 show **No audited cycles** and N/A, never a misleading zero-percent failure rate.
5. Cancelled/template samples and unrelated `CIP/SIP CYCLE REQUEST` records are
	 excluded. A shared LIMS sample type alone was insufficient to exclude CIP/SIP.
6. All charts, summaries, table rows and exports share equipment/date/month filters.
	 Table header filters additionally scope exports but do not silently alter the
	 headline denominator. Plot points and table Details open source drill-downs.
7. Missing dates/cycle prefixes are disclosed as snapshot-wide exclusions, not placed
	 into an invented date period. Source issues and result identities are retained
	 in `cycle-audit-extraction.json` and the JSON snapshot.

### Presentation and refresh

- Separate Pass/Fail scatter lanes trend individual samples by recorded test date.
	Monthly stacked counts provide Pass/Fail totals and percentages in tooltips.
	Monthly selection cross-filters the summary, trend and paginated source table.
- Date inputs and daily range sliders control the time window. The summary shows
	failed/total, failure percentage, passed count and failure-rate variance in
	percentage points. No business target was supplied; it is explicitly N/A.
- WoW/MoM/QoQ/YoY compare trailing 7/30/90/365-day failure rates against the
	preceding equal-length period ending at the selected end date, independently
	of month selection. Insufficient history or no baseline yields N/A. The
	selected-period comparison also requires complete prior-period date coverage.
- Observations, Assumptions and Recommendation distinguish measured outcomes
	from unknown causes. Failures are highlighted without implying a new release rule.
- CSV and JSON download the active table rows across pages. CSV formula escaping
	is enabled. JSON preserves metadata, selection and source result identities.
- The audit view displays its own extraction time and coverage, separately from
	the utility snapshot timestamp. The existing Refresh button re-queries utilities,
	specifications and audits. All files publish together under the existing lock;
	publication errors restore both snapshots. An empty audit extraction retains
	the prior published data. Restart an already-running older service to load this
	backend change; `run_dashboard.bat` launches the updated code on a free port.

### Production verification

- Extraction: `cycle-audits.sql`, query
	`5db60c92-5ea4-419b-86b7-05cfaf8873d8`.
- Independent grouped-count query: `cycle-audit-counts.sql`, query
	`fb77212d-b10e-41f1-99c4-aaf5c27f5718`; results in `cycle-audit-counts.json`.
- Three-year snapshot: **26,877 unique audited samples**, reconciled across
	**25 equipment/outcome groups**. Six duplicate nonblank result rows collapsed.
	Excluded result rows: 1,272 blank/other outcomes and 9 unreleased Pass/Fail values.
	Excluded samples: 255 with missing/ambiguous cycle prefixes and 19 with missing or
	conflicting dates. No conflicting Pass/Fail samples were found in this extraction.
- Default 2024-09-29 through 2026-09-29 selection: Sterilizers **77 failures /
	16,996 audited**; Ovens **7 failures / 794 audited**. Sterilizer 28 is
	**25 / 2,372**; Oven 29 is **3 / 336**; Oven 32 is **1 / 2 (50%)**.
- `python -m unittest discover -s scripts -p test_refresh.py`: 12 tests passed,
	including deduplication, conflicting outcomes, cycle-prefix assignment overriding
	incorrect equipment attributes, Oven 32 classification, refresh
	authorization and combined snapshot publication/rollback.
- `node scripts/verify_dashboard.cjs --audit-only`: audit data checks passed.
- `node scripts/verify_dashboard.cjs --graph-only`: audit checks and existing
	utility graph regressions passed.
- `python scripts/verify_cycle_audits.py --url http://127.0.0.1:8770/`: passed
	desktop/mobile dropdowns, charts, date/month/keyboard-slider filtering, details,
	filtered CSV/JSON, empty state, utility navigation and theme switching. No page
	errors or mobile horizontal overflow. Expected equipment totals are computed
	from the current snapshot. Tests explicitly verify Oven 32 is absent from
	Sterilizers. Installed Microsoft Edge is used; Playwright is pinned in requirements.
- Screenshots: `cycle-audits-desktop.png`, `cycle-audits-mobile.png` and
	`cycle-audits-oven32.png`.
- Existing unrelated full-suite limitation: `verify_dashboard.cjs` without a
	focused flag expects 3,438 nonmissing water endotoxin rows, while the existing
	water snapshot contains 3,440. Water data and this assertion were not changed
	for the cycle-audit work.

## Temporary graph exclusions (2026-09-29)

Right-click a sample point in any utility's trend to hide that result from
the graph. Remaining points determine the date and numeric axes; categorical
timelines also remove unused categories. With no visible points, the graph
shows an empty state. Left-click still opens sample details.

The **Show all hidden samples** button appears while that utility has hidden
results, including results outside the current filters. It restores all of
them and the original selected date range. Exclusions use unique result IDs,
survive filter, utility and theme changes, and reset on page reload or a
successful production refresh. Source data, table rows, downloads, metrics
and monthly result counts are not changed.

Run `node scripts/verify_dashboard.cjs --graph-only` for focused regressions.

## Current utility navigation (2026-09-29)

This section supersedes the earlier two-water-class navigation and scope notes.
All seven utility views are available through the native **Critical Utility**
dropdown, replacing the horizontal tab buttons. Display labels are sorted
alphabetically, independently of the initial Water for Injection selection:

1. Clean Steam North
2. Clean Steam South
3. North Pretreatment
4. Purified Water
5. South Pretreatment
6. South PW Generation Systems
7. Water for Injection

Switching utilities shows exactly one labeled region and redraws its charts
and table without rebuilding its selection state. Each utility retains its
test, locations and date filters. Native select semantics provide keyboard
operation; obsolete tab buttons and tab-panel ARIA references are removed.
The dropdown retains the Echelon styling and fits narrow screens.

The current production snapshot contains 53,179 results and 92 specification
definitions. `system-counts.json` records the independently reconciled 48
system/test groups. South clean steam includes South and South L15; South PW
includes South L10, L15 and L20. Nitrates, coliforms, color and clarity are
included where observed, with categorical timelines preserving source text.
These are source-reported tests, not a newly validated USP applicability list.

Verification: `node scripts/verify_dashboard.cjs` passes alphabetical ordering,
complete utility coverage and existing data regressions. Browser checks passed
all seven selections, one-visible-region behavior, retained Clarity selection,
keyboard Home/Enter activation, and 390 x 844 mobile layout without horizontal
overflow. No page JavaScript errors or editor diagnostics were observed.
Screenshots: `utility-dropdown-desktop.png` and `utility-dropdown-mobile.png`.

## Scope and decisions

- Requested on 2026-09-22; deliver the Echelon dashboard in `../output/`.
- User clarification: include both WFI and Purified Water, separated.
- User clarification: trend tests required by USP; do not implement limits or compliance decisions.
- Source: production `adl_enriched_gbl_cf_qualytics_lvlims`, accessed read-only through Athena.
- Reference workbook: `../data/ExportAll_Utilities - WFI North(Shared)_Sep-22-2026-04-48-55.xls`.
- Initial selection: current date minus two calendar years through current date.
- Existing monthly utility and sterilizer output is not accepted as sample-level water evidence.
- 2026-09-25 correction: include Micro Count for both water classes and retain
	later results with missing collection dates using explicitly labeled LIMS
	event dates. The user requested autonomous decisions when unavailable for
	clarification. A collection-date-only mode remains available; event dates
	are not asserted to be verified collection dates.

## Failure modes and prevention

| Risk | Prevention / acceptance check |
| --- | --- |
| WFI mistaken for Purified Water | Preserve explicit water class and source sampling point; never merge classes. |
| Wrong USP interpretation | Document test-family mapping and references; distinguish microbiological monitoring from monograph tests. No compliance claims. |
| Mixed tests or incompatible units | One test family and unit per graph; retain original parameter and method. |
| Fabricated or incomplete trends | Use source results only; reconcile extracted counts, date coverage, and duplicate result keys. |
| Censored or nonnumeric results plotted as exact values | Preserve raw results and qualifiers; disclose the plotting convention. |
| Stale extraction labeled live | Display actual extraction timestamp separately from sample coverage. |
| Unavailable tests presented as zero | Explicit empty states and missing-data counts. |
| Slow or inaccessible detail tables | Pagination, sorting, filtering, sticky headers, keyboard-accessible controls and modal. |
| Untraceable decisions or exports | Store queries, provenance, checks, and limitations in this docs folder. |

## Verification plan

1. Parse workbook using an Excel parser and establish sample-point/test anchors.
2. Verify production schema and scope from observed values before extracting results.
3. Reconcile extraction counts with production counts and validate result identity.
4. Check separate water classes, test families and units, date-range controls, modal, cross-filtering, and CSV/JSON exports.
5. Check desktop/mobile rendering, empty states, browser errors, and local asset loading.

## Test selection

The scope uses the conventional bulk-water USP test families: total organic
carbon (chapter <643>) and conductivity (<645>) for PW and WFI, and bacterial
endotoxins (<85>) for WFI. Conductivity stages remain separate parameters.
The current licensed USP-NF monographs were not accessible during this run;
site QA must confirm current applicability before using this as a validated
test inventory. This is a trending tool, not a validated release system.

Observed LIMS parameters: `TOC`, `Conductivity Stage 1`,
`Conductivity Stage 2`, `LAL Endotoxin`, and `Micro Count`. The extraction also allows
`Conductivity Stage 3`, but no matching dated results were returned.
Micro Count is included as supporting microbiological monitoring, not represented here
as a universal USP monograph release test. Nitrates, physicals, calibration
dates, instrument identifiers, specification checks, and overall Pass/Fail
parameters are excluded. No limits or compliance flags are computed.

## Workbook findings

The workbook has 1,506 data rows, 1,488 valid sample rows, 474 distinct samples,
and 18 malformed continuation rows. It represents WFI only and includes
2021 sample IDs. It is used to identify structure and parameters, not as the
dashboard's production data. `scripts/inspect_workbook.py` reproduces this
inventory and rejects the continuation rows.

## Production extraction

- Exact query: `water-results.sql`.
- Extraction query ID: `4fe8f1e9-645f-433d-9a32-463422d19ca7`.
- Count reconciliation query ID: `72191e8e-6ca3-4090-ad74-3afd98f40dc3`.
- Extraction timestamp and input hash: `extraction-audit.json`.
- Scope: `securitydepartment = FWN`, utility location path beginning
	`FWN UT /`, and explicit `/ North / PW /` or `/ North / WFI /` segments.
- Join: `s_sample.s_sampleid = sdidataitem.keyid1`, with `sdcid = Sample`.
- Excludes template and cancelled samples. Retains unreleased and blank
	result rows in the data; the dashboard defaults to released rows only.
- Trend-date window: 2023-09-25 through 2026-09-25 inclusive. Trend date is
	`coalesce(collectiondt, eventdt)`. Collection date takes precedence even
	when it is future-dated; a different event date cannot bypass that exclusion.
	No creation-date fallback is used. The extra year supports comparisons.
- The default UI window is today minus two calendar years through today.
	The fixed snapshot date remains visible even when the browser clock advances.
- Source collection timestamps have no verified timezone. Dates are displayed
	as ISO calendar dates without shifting them; extraction time is UTC.

| Water | Parameter | Extracted | In 2024-09-25 to 2026-09-25 |
| --- | --- | ---: | ---: |
| PW | Conductivity Stage 1 | 4,132 | 2,779 |
| PW | Conductivity Stage 2 | 3 | 2 |
| PW | TOC | 4,128 | 2,777 |
| PW | Micro Count | 2,403 | 1,466 |
| WFI | Conductivity Stage 1 | 1,462 | 974 |
| WFI | LAL Endotoxin | 1,942 | 1,309 |
| WFI | TOC | 1,462 | 974 |
| WFI | Micro Count | 1,937 | 1,313 |
| Total | | 17,469 | 11,594 |

All counts reconcile with the independent production query. There are
17,469 unique result identities, including method version, variant, dataset,
parameter type and replicate. There are 1,148 blank results and 1,803 censored
endotoxin results. Censored bounds are labeled series and are excluded from
means and numeric changes. Original result text, operator and qualifier are
retained in downloads and sample details. Zero remains a valid exact value.

## Data gaps

The previous collection-date-only extraction excluded later WFI TOC and
conductivity results, causing their apparent 2025-01-14 cutoff. Production
sample `S-20260921-00658`, for example, has TOC 3 ppb, no collection date,
and event date 2026-09-21 04:04:00. Discovery query
`2d297549-5f98-4fb8-80fa-e63b3b0c46d2` established those fields.

The corrected snapshot retains 11,781 event-dated result rows, explicitly
identified as missing a collection date. Both original timestamps, effective
trend timestamp, and date basis are preserved. The dashboard's strict mode
excludes event-dated rows from charts, summaries, comparisons and downloads.

Four otherwise matching result rows created in the history window have
neither date: one PW Micro Count, one WFI Micro Count and two WFI endotoxin.
They cannot be placed on a timeline and remain excluded. Three future-dated
WFI endotoxin rows remain excluded. These are result counts, not distinct
samples or an inferred sampling schedule. No completeness claim is made.

Latest released, nonblank trend dates: TOC and stage 1 conductivity for both
water classes reach 2026-09-23; WFI endotoxin reaches 2026-09-23; WFI Micro
Count reaches 2026-09-18; PW Micro Count reaches 2026-09-14. These dates
include event-date fallbacks and do not establish actual collection dates.
Recommendations flag source age above 90 days as a review prompt, not a
USP limit or validated sampling-frequency threshold.

## Dashboard behavior

- Reuses the existing Echelon CSS, core, filters, chart runtime, and local
	third-party libraries unchanged. Custom markup, behavior and scoped style
	overrides are in `output/index.html`; branding is copied from the template.
- Water tabs, actual location buttons, and exact parameter/unit selectors
	prevent mixed-water or mixed-test graphs. No unverified physical line
	equivalence is inferred from valve names.
- Location buttons toggle independently, allowing multiple or no selected
	locations. Each plotted location has separately named exact/bound series.
	The test selector lists all observed tests for the water class, including
	Micro Count even when a selected tank has no microbial results. Unmatched
	locations are listed explicitly; changing tests does not change locations.
	The source table includes a sampling-location column, and JSON records the
	selected `lines` array. Drill-through isolates the chosen row's location.
- Date inputs and two daily range sliders control the sample window.
- The date-basis selector defaults to collection date, otherwise event date.
	Collection-date-only mode is available. Table, tooltip, detail dialog and
	downloads identify date provenance; source age uses the selected date basis.
- Monthly bars and the keyboard month selector cross-filter the trend,
	metrics, and source table. Chart points highlight their source row and
	open a detail dialog; row actions offer the same keyboard-accessible detail.
- The dialog retains provenance and drills back to its sampling location.
- Table columns are sortable/filterable, with fixed-height scrolling,
	sticky headers and 20/50/100-row pagination.
- CSV and JSON export all table-filtered rows across pages. CSV formula
	escaping is enabled; JSON includes metadata and the selection. XML and
	Parquet were not requested and are not added.
- Latest value, prior-result variance, exact-result mean, recorded fraction,
	censored count and source age are shown. No target has been supplied;
	targets and unavailable comparisons are N/A, never invented.
- Counts, means and historical comparisons pool selected locations. The
	latest result identifies its location; prior-result variance uses the
	preceding result from that same location, not another selected location.
- WoW/MoM/QoQ/YoY are explicitly defined as trailing 7/30/90/365-day means
	versus the preceding equal window, ending on the selected range end.
	They are not calendar-period aggregates. Gaps and censored-only periods
	return N/A. No causal explanation is inferred from the data.
- Observations, Assumptions and Recommendation refer to the complete
	selected test view. Trend colors identify locations; series labels distinguish
	exact results from reported bounds. Amber warnings indicate data gaps,
	and green bars denote result counts, not passing tests.
- Refresh Date is the actual snapshot import time. Opening or reloading
	the HTML file directly does not query production; opening it through the
	local service refreshes automatically (see Running and refreshing).

## Run and refresh

Open `../output/index.html` directly in a browser. No server or credentials
are embedded. Existing unrelated monthly utility/sterilizer files are left
unchanged and are not loaded by this dashboard.

For an authorized refresh, update the date boundaries in `water-results.sql`,
execute it against the same production database, and save the returned JSON
payload result. Update the importer's date bounds and expected audit counts
for the new snapshot, then run:

```powershell
node scripts/import_results.cjs <saved-athena-tool-result>
node scripts/verify_dashboard.cjs
```

The importer expects the saved Athena tool's table output containing JSON
payload cells. It does not scrape or reinterpret individual result values
from formatted table columns. Protect the output as production laboratory
data; do not publish it to a public web host.

## Verification

`node scripts/verify_dashboard.cjs` checks production reconciliation,
duplicate keys, exact date boundaries, water/test/unit isolation, release
filtering, empty ranges, censored-value exclusion, valid zero handling,
local assets and JSON/bundle equivalence. The refreshed regression also
checks September 2026 TOC and Micro Count coverage, date-source precedence,
event-date counts, strict collection mode, and all eight source count groups.

### Current refresh verification (2026-09-25)

- Default WFI loop TOC: 473 released rows, latest 2026-09-23. Strict
	collection mode returns latest 2025-01-14, confirming the original cause.
- Micro Count is visible in both water-class selectors. WFI WFV01135 has
	101 plotted results through 2026-09-16. PW PWV01756 plus PWV01757 has
	402 results through 2026-09-14, only Micro Count in CFU/ml.
- CSV and JSON both exported all 402 filtered PW microbial rows. Date-basis
	labels and original collection/event timestamps are preserved, along with
	the chosen date mode in JSON selection metadata.
- Pointer download activation and detail dialog work. The browser had a
	magnified visual viewport during testing; resetting its test scale to 1
	resolved coordinate-based click errors without a code workaround.
- Desktop 1440 x 1000 and mobile 390 x 844 chart checks passed. No mobile
	document overflow or page JavaScript errors; editor diagnostics are clear.

### Previous snapshot checks (historical)

The following checks describe the superseded 2026-09-22 snapshot and its
old collection-only default, not current expected counts:

- Desktop viewport 1440 x 1000 and mobile viewport 390 x 844: no document
	horizontal overflow; refresh information remains visible on mobile.
- Four chart instances render, plotted sample markers are present, and the
	local branding image loads. Desktop and mobile screenshots were inspected.
- No page JavaScript errors on initial load or the final reload.
- WFI/PW tabs switch correctly with clicks and arrow-key navigation.
- Selecting a WFI valve opens only LAL Endotoxin results. Three selected
	censored rows yield zero exact values and a null mean, as expected.
- Sample dialog opens from the source table and closes with Escape.
- PW month selection 2024-10 yields 22 matching result and table rows.
- Moving the range-start slider to 2025-01-01 excludes earlier records.
- A September 2026 range at Line 16 HPWS produces the expected empty state.
- CSV and JSON each export 61 active rows, with matching source metadata
	in JSON. CSV columns retain original result text and qualifiers.
- ISO date validation rejects 2025-02-29 and ambiguous formats. Reset
	restores valid dates. Leap-day two-year subtraction uses February 28.
- Source and generated JavaScript/HTML have no reported editor errors.

The browser clock during the previous verification was 2026-09-25, so its dynamic initial
range was 2024-09-25 through 2026-09-25. This does not change the fixed
2026-09-22 extraction or the independently verified 974-row requested-window
count. The unit check pins 2026-09-22 and verifies the requested initial range.

### Previous multi-location verification (historical)

Before this refresh, the multi-location update was verified on 2026-09-25: selecting North WFI Loop (272)
and WFI Tank (272) produces two 61-point TOC series and 122 source rows.
Removing either location, removing all locations, adding an incompatible
test location, JSON export of both locations, and single-location drill-through
passed browser checks without page errors. Mobile width 390 px had no page
overflow. The saved regression script checks the union counts and separate
series as well as the existing water/test/unit isolation guarantees.

## Remaining limitations

- Event dates are not verified collection dates. Review their suitability
	with site QA before using combined-date trends for regulated decisions.
- Missing collection dates make this a partial dated history, not a complete
	sample ledger. No completion percentage against a sampling plan is claimed.
- No scheduled extraction or live Refresh command is configured.
- Current licensed USP-NF applicability and site validation remain external
	approval tasks. No regulatory compliance conclusion is generated.
- Browser checks are focused functional/accessibility checks, not a full
	formal WCAG audit or validated-system qualification.
- Screenshots were inspected in the session; raw source evidence is retained
	locally in `athena-results.txt` and its SHA-256 is in `extraction-audit.json`.