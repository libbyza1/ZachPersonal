# Local Browser Dependencies

Required browser runtimes are stored here so dashboards remain functional when outbound internet access is blocked. `index.html` loads these versioned files before the shared Echelon modules.

## Inventory

| Library | Version | Local files | Upstream license |
|---|---:|---|---|
| ApexCharts | 3.54.1 | `apexcharts-3.54.1.min.js` | MIT |
| D3 | 7.9.0 | `d3-7.9.0.min.js` | ISC |
| PapaParse | 5.4.1 | `papaparse-5.4.1.min.js` | MIT |
| pako | 2.1.0 | `pako-2.1.0.min.js` | MIT and Zlib |
| Day.js | 1.11.10 | `dayjs-1.11.10.min.js` | MIT |
| Tabulator | 5.5.0 | `tabulator-5.5.0.min.js`, `tabulator-5.5.0.min.css` | MIT |

The files were downloaded from their version-pinned `cdn.jsdelivr.net/npm` package URLs. Local hosting changes delivery only; it does not alter or replace upstream license obligations. Preserve copyright and license notices when updating files.

## Update Procedure

1. Review the upstream release notes, security advisories, and license terms.
2. Download every required core/module file from one pinned version.
3. Use versioned filenames and update the paths in `index.html`.
4. Recalculate and replace the SHA-256 values below.
5. Run the offline browser check from `docs/09-TESTING.md` with outbound requests blocked.

## SHA-256

```text
56fb1229fe77c8cc66f31ea125bea9ed37a3840c97b66a23e44c851cff717b2b  apexcharts-3.54.1.min.js
f2094bbf6141b359722c4fe454eb6c4b0f0e42cc10cc7af921fc158fceb86539  d3-7.9.0.min.js
9cfdb93f38afcf2d076abecd66d32bfd3383cdf1967654ebc26a26605daf4173  dayjs-1.11.10.min.js
ede2693a4a6a5126b9d35669062b358ecab6ae7b9b86a1cf302feb45a8514907  pako-2.1.0.min.js
b8e870c5d2b29772f10c9fa9a693c8b896aac8540ed6701e3cc6304c683febdb  papaparse-5.4.1.min.js
bb1a387ba706b8c399ec8ae94567c445f20b0d9b8297e6c16612b15fd690a132  tabulator-5.5.0.min.css
9fd97d87217a44afff6f14c19390e2be526dde470eeefdf3d1fe93fcc7786e48  tabulator-5.5.0.min.js
```

The default template uses its system font fallback and makes no external runtime or font request.
