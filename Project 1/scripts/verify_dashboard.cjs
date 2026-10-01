const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const project = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(project, 'output/data/water-results.json'), 'utf8'));
const audits = JSON.parse(fs.readFileSync(path.join(project, 'output/data/cycle-audits.json'), 'utf8'));
const html = fs.readFileSync(path.join(project, 'output/index.html'), 'utf8');
const script = html.match(/<script id="terminal-logic">([\s\S]*?)<\/script>/)[1];
const context = {window: {FWN_WATER: data, FWN_AUDITS: audits}, DashboardUtils: {escHtml: String},
    DashboardCharts: {}, document: {addEventListener() {}}, console};
vm.createContext(context);
vm.runInContext(script, context);
const api = context.window.FWN_TEST;
assert.equal(new Set(audits.rows.map(row => row.sample)).size, audits.rows.length);
assert(audits.rows.every(row => ['PASS', 'FAIL'].includes(row.outcome) && row.released === 'Y'));
assert(audits.rows.every(row => row.date >= audits.metadata.historyStart && row.date <= audits.metadata.asOf));
assert(audits.rows.every(row => row.sourceResults.every(result => result.outcome === row.outcome)));
assert(audits.rows.every(row => Number(row.description.match(/^\s*(\d{1,2})\s*-/)[1]) === row.number));
assert(audits.rows.every(row => row.kind === ([18, 29, 32].includes(row.number) ? 'Oven' : 'Sterilizer')));
assert(audits.rows.some(row => row.number === 32 && row.kind === 'Oven'));
for (const kind of ['Sterilizer', 'Oven']) {
    const state = {equipment: '', start: audits.metadata.historyStart, end: audits.metadata.asOf, month: null};
    const rows = api.auditRows(kind, state);
    assert(rows.length > 0);
    const summary = api.auditSummary(rows);
    assert.equal(summary.total, summary.passed + summary.failed);
    assert.equal(summary.failed, rows.filter(row => row.outcome === 'FAIL').length);
    const equipment = rows[0].equipment;
    assert(api.auditRows(kind, {...state, equipment}).every(row => row.equipment === equipment));
    assert(api.auditRows(kind, {...state, month: '2026-09'}).every(row => row.date.startsWith('2026-09')));
    assert.equal(api.auditRows(kind, {...state, start: '2099-01-01'}).length, 0);
}
assert.equal(api.auditSummary([]).rate, null);
assert.equal(api.auditContent({cycleDescription: '  Terminal  '}), 'TERMINAL');
assert.equal(api.auditContent({cycleDescription: 'Air   Removal\tTest'}), 'AIR REMOVAL TEST');
assert.equal(api.auditContent({cycleDescription: null}), '');
const contentState = {equipment: 'Sterilizer 28', start: audits.metadata.historyStart, end: audits.metadata.asOf};
const contentOptions = Array.from(api.auditContentOptions(contentState.equipment));
assert(contentOptions.length > 1);
const equipmentRows = api.auditRows('Sterilizer', contentState);
assert.equal(api.auditRows('Sterilizer', {...contentState, contents: []}).length, 0);
assert.equal(api.auditRows('Sterilizer', {...contentState, contents: contentOptions}).length, equipmentRows.length);
for (const content of contentOptions) {
    const filtered = api.auditRows('Sterilizer', {...contentState, contents: [content]});
    assert.equal(filtered.length, equipmentRows.filter(row => api.auditContent(row) === content).length);
    assert(filtered.every(row => api.auditContent(row) === content));
}
assert.equal(api.auditRows('Sterilizer', {...contentState, contents: contentOptions.slice(0, 2)}).length,
    equipmentRows.filter(row => contentOptions.slice(0, 2).includes(api.auditContent(row))).length);
const auditCounts = JSON.parse(fs.readFileSync(path.join(project, 'docs/cycle-audit-counts.json'), 'utf8'));
if (auditCounts.snapshotQueryId === audits.metadata.queryId) {
    for (const [kind, equipment, outcome, total, initialTotal] of auditCounts.counts) {
        const rows = audits.rows.filter(row => row.kind === kind && row.number === Number(equipment) && row.outcome === outcome);
        assert.equal(rows.length, Number(total));
        assert.equal(rows.filter(row => row.date >= auditCounts.initialStart).length, Number(initialTotal));
    }
}
const auditBundle = {window: {}};
vm.runInNewContext(fs.readFileSync(path.join(project, 'output/data/cycle-audits.js'), 'utf8'), auditBundle);
assert.equal(JSON.stringify(auditBundle.window.FWN_AUDITS), JSON.stringify(audits));
console.log('PASS: unique nonblank audit samples, equipment/date/month isolation, summary counts, empty state and snapshot parity.');
if (process.argv.includes('--audit-only')) return;
const reconciliation = JSON.parse(fs.readFileSync(path.join(project, 'docs/system-counts.json'), 'utf8'));
assert.equal(data.metadata.asOf, reconciliation.asOf, 'Reconcile production counts for the refreshed snapshot before running this audit.');
assert.equal(data.rows.length, reconciliation.counts.reduce((total, group) => total + group[2], 0));
assert.equal(new Set(data.rows.map(row => row.id)).size, data.rows.length);
assert(data.rows.every(row => row.date >= reconciliation.historyStart && row.date <= reconciliation.asOf));
assert.equal(api.tabs.length, 7);
assert.deepEqual(Array.from(api.utilityOptions, option => option.label), [
    'Clean Steam North', 'Clean Steam South', 'North Pretreatment', 'Purified Water',
    'South Pretreatment', 'South PW Generation Systems', 'Water for Injection'
]);
assert.deepEqual(Array.from(api.utilityOptions, option => option.id).sort(), Array.from(api.tabs, tab => tab.id).sort());
assert(html.includes('for="utility-select"'));
assert(!html.includes('role="tablist"'));
assert.equal(new Set(data.rows.map(row => row.water + '|' + row.test)).size, reconciliation.counts.length);
for (const [water, test, count, initialCount] of reconciliation.counts) {
    const rows = data.rows.filter(row => row.water === water && row.test === test);
    assert.equal(rows.length, count, water + '|' + test);
    assert.equal(rows.filter(row => row.date >= reconciliation.initialStart).length, initialCount);
    for (const units of new Set(rows.map(row => row.units))) {
        const selection = {lines: [...new Set(rows.map(row => row.line))], test, units,
            start: reconciliation.historyStart, end: reconciliation.asOf, released: true};
        const selectedRows = api.selectRows(water, selection);
        assert.equal(selectedRows.length, rows.filter(row => row.units === units && row.released).length);
        assert(selectedRows.every(row => row.water === water && row.test === test && row.units === units && row.released));
    }
}
assert.equal(JSON.stringify(api.defaultDates(new Date('2026-09-22T12:00:00Z'))), JSON.stringify({start: '2024-09-22', end: '2026-09-22'}));
assert.equal(api.defaultDates(new Date('2024-02-29T12:00:00Z')).start, '2022-02-28');
assert(api.validDate('2024-02-29'));
assert(!api.validDate('2025-02-29'));
assert(!api.validDate('09/22/2026'));
assert(!api.validDate(''));
const state = {lines: ['North WFI Loop (272)'], test: 'TOC', units: 'ppb',
    released: true, start: '2024-09-22', end: '2026-09-22'};
const selected = api.selectRows('WFI', state);
assert(selected.length > 0);
assert(selected.every(row => row.water === 'WFI' && row.test === 'TOC' && row.units === 'ppb' && row.released));
assert.equal(api.selectRows('PW', state).length, 0);
assert(api.selectRows('WFI', {...state, start: '2026-09-01'}).length > 0);
assert.equal(api.selectRows('WFI', {...state, start: '2026-09-01', collectionOnly: true}).length, 0);
assert(api.selectRows('WFI', {...state, collectionOnly: true}).every(row => row.collectedAt));
assert.equal(data.rows.filter(row => !row.collectedAt).length, data.metadata.eventDatedRows);
assert(data.rows.every(row => row.sampleAt === (row.collectedAt || row.eventAt)));
assert(data.rows.every(row => row.date === row.sampleAt.slice(0, 10)));
for (const water of ['PW', 'WFI']) {
    const micro = data.rows.filter(row => row.water === water && row.test === 'Micro Count');
    assert(micro.some(row => row.released && row.date >= '2026-09-01' && row.value !== null));
    const microState = {...state, lines: [...new Set(micro.map(row => row.line))], test: 'Micro Count', units: 'CFU/ml'};
    const microSelection = api.selectRows(water, microState);
    assert(microSelection.length > 0);
    assert(microSelection.every(row => row.test === 'Micro Count' && row.units === 'CFU/ml' && row.water === water));
}
const multiple = {...state, lines: ['North WFI Loop (272)', 'WFI Tank (272)']};
const combined = api.selectRows('WFI', multiple);
const tank = api.selectRows('WFI', {...state, lines: ['WFI Tank (272)']});
assert.equal(combined.length, selected.length + tank.length);
assert.equal(new Set(combined.map(row => row.line)).size, 2);
assert(combined.every(row => row.water === 'WFI' && row.test === 'TOC' && row.units === 'ppb'));
assert.equal(api.selectRows('WFI', {...state, lines: []}).length, 0);
assert.equal(api.selectRows('WFI', {...state, lines: ['WFV01029']}).length, 0);
const series = api.locationSeries(combined, multiple.lines);
assert.equal(series.length, 2);
assert(series.every(group => new Set(group.rows.map(row => row.line)).size === 1));
assert.notEqual(series[0].name, series[1].name);
assert.equal(series.reduce((total, group) => total + group.rows.length, 0), combined.filter(row => row.bound !== null).length);
const hiddenState = {...multiple, hiddenSamples: new Set()};
const sourceBeforeHiding = JSON.stringify(data);
const plottedBeforeHiding = api.trendData('WFI', combined, hiddenState).groups.flatMap(group => group.rows);
const outlier = plottedBeforeHiding.reduce((highest, row) => row.bound > highest.bound ? row : highest);
hiddenState.hiddenSamples.add(outlier.id);
const plottedAfterHiding = api.trendData('WFI', combined, hiddenState).groups.flatMap(group => group.rows);
assert.equal(plottedAfterHiding.length, plottedBeforeHiding.length - 1);
assert(!plottedAfterHiding.some(row => row.id === outlier.id));
assert.equal(api.selectRows('WFI', hiddenState).length, combined.length);
for (const row of plottedBeforeHiding) hiddenState.hiddenSamples.add(row.id);
assert.equal(api.trendData('WFI', combined, hiddenState).groups.length, 0);
hiddenState.hiddenSamples.clear();
assert.equal(api.trendData('WFI', combined, hiddenState).groups.flatMap(group => group.rows).length, plottedBeforeHiding.length);
assert.equal(JSON.stringify(data), sourceBeforeHiding);
const graphElements = new Map();
context.document.documentElement = {dataset: {theme: 'light'}};
context.document.getElementById = id => {
    if (!graphElements.has(id)) graphElements.set(id, {});
    return graphElements.get(id);
};
context.getComputedStyle = () => ({getPropertyValue: () => '#666666'});
context.ApexCharts = function(host, options) {
    this.options = options;
    this.render = () => {};
    this.destroy = () => {};
};
api.states.WFI = hiddenState;
context.graphRows = combined;
const drawTrend = () => vm.runInContext("drawTrend('WFI', graphRows)", context);
drawTrend();
assert.equal(graphElements.get('WFI-restore-samples').hidden, true);
assert.equal(hiddenState.chart.options.xaxis.min, Date.parse(hiddenState.start + 'T00:00:00Z'));
assert.doesNotThrow(() => hiddenState.chart.options.chart.events.dataPointSelection({button: 2}, null, {seriesIndex: 0, dataPointIndex: 0}));
const secondSeriesRow = api.trendData('WFI', combined, hiddenState).groups[1].rows[0];
let prevented = false;
const marker = {getAttribute: () => '0', closest: () => ({getAttribute: () => '1'})};
graphElements.get('WFI-trend').oncontextmenu({target: {closest: () => marker}, preventDefault: () => { prevented = true; }});
assert(prevented);
assert(hiddenState.hiddenSamples.has(secondSeriesRow.id));
assert.equal(hiddenState.chart.options.series.reduce((total, group) => total + group.data.length, 0), plottedBeforeHiding.length - 1);
assert.equal(hiddenState.chart.options.xaxis.min, undefined);
assert.equal(hiddenState.chart.options.xaxis.max, undefined);
assert.equal(hiddenState.chart.options.yaxis.max, undefined);
assert.equal(graphElements.get('WFI-restore-samples').hidden, false);
graphElements.get('WFI-trend').oncontextmenu({target: {closest: () => null}, preventDefault: () => assert.fail('Background context menu should not be blocked')});
for (const row of plottedBeforeHiding) hiddenState.hiddenSamples.add(row.id);
drawTrend();
assert.equal(hiddenState.chart.options.series.length, 0);
assert.equal(hiddenState.chart.options.noData.text, 'No visible samples in this selection');
assert.equal(graphElements.get('WFI-restore-samples').hidden, false);
hiddenState.hiddenSamples.clear();
drawTrend();
assert.equal(graphElements.get('WFI-restore-samples').hidden, true);
assert.equal(hiddenState.chart.options.series.reduce((total, group) => total + group.data.length, 0), plottedBeforeHiding.length);
assert.equal(JSON.stringify(data), sourceBeforeHiding);
const categoricalRows = data.rows.filter(row => row.test === 'Color' && !row.missing);
const categoryState = {test: 'Color', units: categoricalRows[0].units, lines: [...new Set(categoricalRows.map(row => row.line))], hiddenSamples: new Set(categoricalRows.filter(row => row.raw === categoricalRows[0].raw).map(row => row.id))};
const categoricalTrend = api.trendData(categoricalRows[0].water, categoricalRows, categoryState);
assert(!categoricalTrend.categories.includes(categoricalRows[0].raw));
assert(categoricalTrend.groups.every(group => group.rows.every(row => !categoryState.hiddenSamples.has(row.id))));
console.log('PASS: graph-only hiding, right-button selection guard, multiple-series identity, auto-fit axes, empty state, category fitting, restore, and unchanged source data.');
if (process.argv.includes('--graph-only')) return;
const endotoxin = data.rows.filter(row => row.test === 'LAL Endotoxin' && !row.missing);
assert.equal(endotoxin.length, 3438);
assert(endotoxin.every(row => row.censored && row.value === null && row.bound !== null));
assert.equal(api.mean(endotoxin), null);
assert.equal(api.mean([{value: 0, censored: false}, {value: 2, censored: false}]), 1);
assert.equal(api.mean([]), null);
assert(data.rows.filter(row => row.missing).every(row => row.value === null));
for (const test of ['Nitrates', 'Coliforms', 'Color', 'Clarity']) {
    const rows = data.rows.filter(row => row.test === test);
    assert(rows.length > 0, test);
    assert(rows.every(row => row.value === null && row.bound === null));
    assert(rows.filter(row => !row.missing).every(row => row.qualitative));
    assert.equal(api.mean(rows), null);
    const groups = api.locationSeries(rows, [...new Set(rows.map(row => row.line))], true);
    assert.equal(groups.reduce((total, group) => total + group.rows.length, 0), rows.filter(row => !row.missing).length);
    assert(groups.every(group => group.name.endsWith('Reported category')));
    assert.equal(api.categoriesFor(rows).length, new Set(rows.filter(row => !row.missing).map(row => row.raw)).size);
}
assert(api.categoriesFor(data.rows.filter(row => row.test === 'Nitrates')).includes('N/A'));
assert(data.rows.filter(row => row.test === 'Color').every(row => row.method === 'ColorV2'));
assert(data.rows.filter(row => row.test === 'Clarity').every(row => row.method === 'ClarityV2'));
assert(data.rows.filter(row => row.test === 'Coliforms').every(row => row.water === 'Pretreatment-North'));
assert(data.rows.some(row => row.water === 'CS-South' && row.location.includes(' / South L15 / CS /')));
for (const area of ['South L10', 'South L15', 'South L20']) {
    assert(data.rows.some(row => row.water === 'PW-South' && row.location.includes(' / ' + area + ' / PW /')));
}
for (const tab of api.tabs) {
    const rows = data.rows.filter(row => row.water === tab.id);
    assert(rows.length, tab.id);
    assert(rows.some(row => row.criteria?.length), tab.id + ' criteria');
}
assert(!html.includes("['Mean, exact results'"));
assert(!html.includes("['Latest source age'"));
assert(html.includes('Select All'));
assert(html.includes('id="refresh-data"'));
assert(data.criteria.length > 0);
const tocCriteria = api.acceptanceCriteria(selected);
assert(tocCriteria.groups.some(group => group.rules.includes('InSpec: <= 200')));
assert(tocCriteria.groups.some(group => group.rules.includes('Upper OutOfSpec: > 450')));
assert.equal(api.acceptanceCriteria([{criteria: [], units: 'ppb'}]).missing, 1);
const versions = api.acceptanceCriteria([{criteria: [0, 1], units: 'CFU/ml'}], [
    {specId: 'Example', version: '1', label: 'InSpec', operator1: '<=', value1: '0.04'},
    {specId: 'Example', version: '2', label: 'InSpec', operator1: '<=', value1: '0'}
]);
assert.equal(versions.groups.length, 2);
assert.equal(versions.missing, 0);
for (const match of html.matchAll(/(?:src|href)="(assets\/[^"?]+|data\/[^"?]+)"/g)) {
    assert(fs.existsSync(path.join(project, 'output', match[1])), 'Missing local asset: ' + match[1]);
}
const bundle = {window: {}};
vm.runInNewContext(fs.readFileSync(path.join(project, 'output/data/water-results.js'), 'utf8'), bundle);
assert.equal(JSON.stringify(bundle.window.FWN_WATER), JSON.stringify(data));
console.log('PASS: 48 independently reconciled production groups, seven system tabs, qualitative timelines, unique keys, date range, system/test/unit isolation, release filter, empty state, censored means, linked criteria, asset paths, and JSON/bundle parity.');