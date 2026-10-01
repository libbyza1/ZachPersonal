# Project 1: FWN Validations Test Function 4 Terminal

## Current scope (2026-10-01)

Provide an Echelon-styled, sample-level dashboard for Alcon Fort Worth North
utilities and sterilizer/oven cycle audits, delivered in `output/`. Support
source investigation, trending, and traceable exports; this is not a validated
release system or an automated USP compliance determination.

The original requirements are retained verbatim below. The current scope and
acceptance criteria supplement them, not remove them. A missing target,
unverified USP applicability, or incomplete feature remains an explicit gap,
not a silently waived requirement. Implementation details and verification
instructions belong in [docs/implementation.md](docs/implementation.md).

### Business objective and users

Help site validation and quality reviewers inspect utility results and recorded
cycle outcomes, compare time periods, identify data gaps, and drill into source
records without mixing incompatible tests or inventing acceptance limits.

### Included views and sources

- Production source: `adl_enriched_gbl_cf_qualytics_lvlims`, queried read-only
	through Athena. Reference exports in `data/` establish mappings and evidence;
	they do not replace the production snapshot.
- Critical Utility dropdown: Clean Steam North, Clean Steam South, North
	Pretreatment, Purified Water, South Pretreatment, South PW Generation Systems,
	and Water for Injection. Labels are alphabetical; WFI is the initial view.
- Separate Sterilizers and Ovens dropdowns, each with individual equipment and
	all-equipment choices. Only one utility or audit view is visible at a time.
- Utility tests include observed TOC, conductivity stages, LAL Endotoxin, Micro
	Count, Nitrates, Coliforms, Color and Clarity where available. One test and
	unit per trend; categorical text and reported bounds retain their meaning.
- Cycle audits count unique LIMS sample IDs with released, nonblank PASS/FAIL
	results. Equipment comes from the cycle-number prefix; 18, 29 and 32 are ovens.
	Unresolved prefixes, dates, or conflicting outcomes are excluded and disclosed.

### Functional requirements

- Default date range: today minus two calendar years through today, with ISO
	date inputs, daily range sliders, a reset action, and a month selector.
	Snapshots include approximately three years of dated history for comparisons.
- Utility sampling locations support multi-selection, Select All, and an empty
	selection. Test choices remain available even when selected locations have no
	matching results. Keep utility, test, and unit boundaries explicit.
- Utility trends use collection date where present, otherwise explicitly labeled
	event date. Offer collection-date-only mode and default to released results.
	Never substitute sample creation date or claim event date is collection date.
- Show linked LIMS specification expressions, versions, provenance, and missing
	criteria. Preserve differing source bands without calculating new compliance
	outcomes. Site QA must confirm licensed USP-NF applicability and controlled
	methods; Micro Count is supporting microbiological monitoring.
- Sterilizer cycle-content multi-selection supports Select All, Clear All,
	and per-equipment retention during the page session. Normalize case and
	whitespace only; blank content is Not supplied, not an invented category.
	Ovens retain all cycle types without a cycle-content selector.
- Audit trends use recorded TEST DATE. Failed/total, failure rate, passed count,
	and prior-period failure-rate change use the same equipment/content/date/month
	selection. Empty denominators and unavailable baselines show N/A.
- Month selection cross-filters related trends, metrics, and tables. Table
	header filters scope downloads but do not change headline denominators.
- Sample points and table actions expose detailed provenance in a modal, with
	drill-through to the sampling location or equipment. Utility point selection
	also highlights its source row.
- Utility-only temporary graph exclusions hide right-clicked result points and
	auto-fit remaining axes, with a restore action. They must not change data,
	metrics, monthly counts, tables, or exports; reload/refresh clears exclusions.
- Provide sortable/filterable scrolling tables with fixed headers and
	20/50/100-row pagination. CSV and JSON export all active table rows across
	pages, preserving source values and selection/provenance in JSON.
- Display utility and audit extraction times and snapshot coverage. Local
	service Refresh re-queries utilities, specifications, and audits; static HTML
	viewing does not query production. Failed refreshes preserve published data.
- Retain Echelon branding, light/dark themes, responsive desktop/mobile layouts,
	keyboard-operable controls, visible focus, descriptive info controls, meaningful
	colors, and Observations/Assumptions/Recommendation sections.
- Preserve the original requirements for KPI targets, variance and trends,
	exception highlighting, cross-highlighting, and additional export formats when
	required. Do not fabricate targets, causes, outlier rules, or missing data.

## Success criteria and acceptance

| ID | Measurable acceptance criterion | Verification / qualification |
| --- | --- | --- |
| SC-01 | Dashboard opens from `output/index.html`, loads local assets, and exposes all seven utility views plus sterilizer/oven navigation with exactly one visible view. | Asset checks plus desktop/mobile browser checks. |
| SC-02 | Utility result IDs are unique; counts and dated coverage match independent production evidence for the same snapshot. Audit sample IDs are unique and independent equipment/outcome totals reconcile. | Node verifier and dated reconciliation artifacts in `docs/`; refresh requires renewed production evidence. |
| SC-03 | No selected trend mixes utility systems, tests or units. Multi-location selection produces the matching union without duplicates; no selection yields an empty view. | Utility filter and series regressions; browser spot checks. |
| SC-04 | Initial/reset dates span two calendar years through today, including leap-day handling. Invalid dates are rejected; date and month controls update related views consistently. | Pinned-date regressions and browser input/slider/month checks. |
| SC-05 | Collection/event provenance, missing values, raw categorical text and censored bounds remain distinguishable. Censored values are not treated as exact measurements in means. | Data assertions, details, criteria and export checks. |
| SC-06 | Audits include only eligible released PASS/FAIL samples; prefix classification, conflict exclusion, contents filtering, failed/total and empty-rate handling agree across views. | Audit data checks, refresh unit tests and browser audit verifier. |
| SC-07 | Monthly selections update related metrics/trends/tables; point and row details drill through correctly. Temporary utility point hiding changes only that graph and can be fully restored. | Graph regressions plus real-pointer, keyboard and modal checks. |
| SC-08 | CSV/JSON row counts equal all table-filtered rows, not just the current page; source values are retained and CSV formula escaping is enabled. | Browser download checks and parsed export comparison. XML/Parquet remain conditional on an explicit need. |
| SC-09 | Refresh shows actual extraction time, preserves appropriate filters, prevents overlapping refreshes, rejects unauthorized requests, and preserves the previous publication on failure. | Mocked service tests plus an authorized production refresh when required; unit tests alone do not prove production access. |
| SC-10 | Tables sort/filter/page with headers visible while scrolling; controls, dialogs, themes and charts work at desktop and 390-pixel mobile width without page overflow or JavaScript errors. | Browser verifier, screenshots, keyboard walkthrough and manual utility checks. Formal accessibility qualification remains separate. |
| SC-11 | Historical comparisons clearly define trailing 7/30/90/365-day windows; unavailable baselines/targets are N/A. Linked criteria retain versions and do not imply a newly computed release decision. | Inspect rendered definitions, arithmetic and edge cases. Approved targets and QA-confirmed USP applicability remain outstanding. |
| SC-12 | Each view provides labels, units/legends, values/percentages where meaningful, context, exceptions and Observations/Assumptions/Recommendation. Every original KPI and cross-highlighting requirement is assessed explicitly. | Manual requirements review; current UI does not establish blanket fulfillment of every original requirement. |
| SC-13 | Relevant decisions, limitations, evidence and verification outcomes are traceable in `docs/`, and documentation matches completed implementation changes. | Documentation review at task completion; record checks actually run and their results. |

### Outstanding acceptance items

- Licensed USP-NF applicability, site validation, approved KPI targets, and a
	sampling-plan denominator are not supplied or established by the dashboard.
- Current utility metrics emphasize latest and recorded results with prior-value
	variance; every KPI does not yet have its own target, variance, and trend.
	Source warnings and audit failures do not constitute a validated outlier rule.
- Cross-filtering and utility row highlighting exist, but comprehensive
	cross-highlighting across every visual is not established.
- Automated coverage is focused, not a formal WCAG audit or full system
	qualification. Known verifier limitations and snapshot-dependent assertions
	must be reported rather than treated as passes.
- No scheduled refresh, shared authenticated hosting, or automatic GitHub
	publication is part of the current implementation. Protect production data.

## Documentation maintenance

At each completed task, update this file when scope, requirements, or success
criteria change, and update `docs/implementation.md` when behavior, decisions,
limitations, setup, or verification steps change. Preserve original requirements
and identify gaps explicitly. Record meaningful outcomes, not every intermediate
edit; never describe a check as passed unless it ran. Keep analytical evidence
and decision records in `docs/`; the runnable dashboard remains in `output/`.

## Original requirements (preserved verbatim)

1. Context and User Requirements
Build a professional dashboard called the "FWN Validations Test Function 4 Terminal"
Follow the Echelon Template
Store it in the output folder
Business objective
Use case scope
Success criteria
Using the adl_enriched_gbl_cf_qualytics_lvlims database, populate the "FWN Validations Test Function 4 Terminal" with different buttons where I can see the trended data based on USP requirements for different Purified Water Lines for Alcon Fort Worth North Site. The buttons should display a graph with a scroll bar based on sample date - I can change the scroll bar to change the range of samples displayed on the graphs. There should only be one sample type per graph. For example, do not mix TOC and Endotoxin samples." The intitial graph range should be current to the last two years. Use the samples located in C:\Users\libbyza1\OneDrive - Alcon\Echelon Projects\Project 1\data\ExportAll_Utilities - WFI North(Shared)_Sep-22-2026-04-48-55.xls to understand the dataset that is required from S3. 

 
2. Data & Document Sources: Clearly state
The data comes from the adl_enriched_gbl_cf_qualytics_lvlims production database.
 
3. Validation Criteria
Define how outputs are verified
Expected format (see visualization tips)
Data checks (completeness, accuracy)
Business logic rules
Ensure outputs are measurable and testable
Dashboard must have a clear Refresh Date to show when the data was last refreshed.
Date formats must be displayed consistently and unambiguously to avoid confusion between day and month across international regions.
Every chart, metric, and table should have
Clear labels text, color legend, actual values, (and percentage to tell full story).
Three blocks Observations, Assumptions, Recommendation to naturally answer: What happened? Why did it happen? What should we do next?
A selective modal popup to show detailed drill-down data.
An Info icon to show a descriptive context / metric definition which is visible upon hovering.
Actionable drill through.
Every table should be sortable, filterable, and sticky header that stays visible at the top while the content scrolls.
Large data tables should include pagination to improve performance and usability.
Use consistent colors and definitions across all metrics and reports.
Reserve color for meaning — don't use colors solely for decoration.
Ensure visuals are accessible, including color-blind friendly palettes and sufficient text contrast.
Avoid using the same chart types — use creative visuals (line, bar, KPI cards, waterfall, scatter) to best illustrate the story.
Dashboard data must be downloadable to CSV, and other types such as XML, JSON, and Parquet if required.
Enable cross-filtering and cross-highlighting so selections in one visual automatically update related visuals.
Every KPI should show target, variance, and trend in addition to the current value.
Use conditional formatting to highlight exceptions, risks, and outliers that require attention.
Include historical trends (WoW, MoM, QoQ, YoY) to provide context beyond a point-in-time snapshot.
4. Failure Mode (Inverted Thinking) - Critical
 “Don’t just provide a solution — first identify how this request could fail or go wrong. Then invert those risks into recommendations to avoid wasting time, cost, or resources.”
 
 
5. Clarification Protocol
“If unsure about any requirement, data source, or constraint — ask questions before proceeding.”
 
 
6. Documentation Requirement
All analysis, decisions, and outputs must be written to: /docs
This enforces: Traceability, Reusability, and Auditability
 