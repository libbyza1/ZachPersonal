const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const project = path.resolve(__dirname, '..');
const input = process.argv[2];
assert(input, 'Provide the saved Athena tool result containing JSON payload rows.');
const source = fs.readFileSync(input, 'utf8');
const structured = process.argv.includes('--json') ? JSON.parse(source) : null;
const asOf = structured?.asOf || '2026-09-25';
assert(/^\d{4}-\d{2}-\d{2}$/.test(asOf));
const shiftYear = years => {
    const date = new Date(asOf + 'T00:00:00Z');
    const month = date.getUTCMonth();
    date.setUTCFullYear(date.getUTCFullYear() - years);
    if (date.getUTCMonth() !== month) date.setUTCDate(0);
    return date.toISOString().slice(0, 10);
};
const historyStart = shiftYear(3);
const initialStart = shiftYear(2);
const batches = structured ? [structured.records] : source.split(/\r?\n/).filter(line => /^\|\s*\[\[/.test(line))
    .map(line => JSON.parse(line.trim().slice(1, -1).trim()));
assert(batches.length > 0, 'No JSON result batches found.');
const queryId = structured?.queryId || source.match(/Query ID: ([a-f0-9-]+)/)?.[1];
assert(queryId, 'Missing Athena query ID.');
const keys = new Set();
const rows = batches.flat().map(record => {
    assert.equal(record.length, 22);
    const [sampleId, sampleAt, point, location, description, status, water,
        method, version, variant, dataset, parameter, parameterType, replicate,
        display, units, entered, operator, qualifier, released, collectedAt, eventAt] = record;
    const systemPaths = {
        PW: /\/ North \/ PW \//, WFI: /\/ North \/ WFI \//,
        'CS-North': /\/ North \/ CS \//, 'CS-South': /\/ (South|South L15) \/ CS \//,
        'Pretreatment-North': /\/ North \/ Pretreatment \//,
        'Pretreatment-South': /\/ South \/ Pretreatment \//,
        'PW-South': /\/ South L(10|15|20) \/ PW \//
    };
    assert(systemPaths[water]?.test(location), `Unexpected system/location: ${water} / ${location}`);
    const date = sampleAt.slice(0, 10);
    assert.equal(sampleAt, collectedAt || eventAt);
    assert(date >= historyStart && date <= asOf);
    const id = JSON.stringify([sampleId, method, version, variant, dataset,
        parameter, parameterType, replicate]);
    assert(!keys.has(id), `Duplicate result identity: ${id}`);
    keys.add(id);
    const raw = (display || entered || '').trim();
    const match = raw.match(/^(?:(LT|LE|GT|GE|<=|>=|<|>)\s*)?([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)$/i);
    const bound = match ? Number(match[2]) : null;
    const comparator = (match?.[1] || operator || '').trim();
    const censored = Boolean(comparator && comparator !== '=') || Boolean(qualifier?.trim());
    return {id, sampleId, date, sampleAt, collectedAt, eventAt,
        dateBasis: collectedAt ? 'Collection date' : 'Event date (collection missing)', water, point,
        line: location.split(' / ').at(-1), location, description, status,
        test: parameter, method, version, variant, dataset, parameterType, replicate,
        raw, units: units || 'Not supplied', operator: comparator, qualifier: qualifier || '',
        released: released === 'Y', value: censored ? null : bound, bound,
        censored, missing: !raw, qualitative: Boolean(raw && bound === null && !censored)};
});
assert(rows.length > 0);
const criteria = [];
const criterionKeys = new Map();
const byId = new Map(rows.map(row => [row.id, row]));
for (const record of structured?.criteriaRecords || []) {
    assert.equal(record.length, 23);
    const id = JSON.stringify(record.slice(0, 8));
    const row = byId.get(id);
    if (!row) continue;
    const [specId, version, status, active, label, operator1, value1, operator2, value2, units, waived, approvedAt, limitLabel, definitionVersion, matchingRule] = record.slice(8);
    const criterion = {specId, version, status, active, label, operator1, value1, operator2, value2, units, waived, approvedAt, limitLabel, definitionVersion, matchingRule};
    const key = JSON.stringify(criterion);
    if (!criterionKeys.has(key)) { criterionKeys.set(key, criteria.length); criteria.push(criterion); }
    row.criteria ||= [];
    const index = criterionKeys.get(key);
    if (!row.criteria.includes(index)) row.criteria.push(index);
}
const counts = {};
for (const row of rows) {
    const key = `${row.water} | ${row.test} | ${row.units}`;
    const group = counts[key] ||= {rows: 0, initialWindow: 0, released: 0, missing: 0, censored: 0};
    group.rows++;
    group.initialWindow += Number(row.date >= initialStart);
    group.released += Number(row.released);
    group.missing += Number(row.missing);
    group.censored += Number(row.censored);
}
const metadata = {
    source: 'adl_enriched_gbl_cf_qualytics_lvlims', environment: 'prod',
    extractedAt: structured?.extractedAt || new Date().toISOString(), asOf,
    historyStart, initialStart, queryId,
    criteriaQueryId: structured?.criteriaQueryId || null,
    criteriaCount: criteria.length,
    rowsWithoutCriteria: rows.filter(row => !row.criteria?.length).length,
    sourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
    rowCount: rows.length, counts,
    dateBasis: 'Collection date when present; otherwise LIMS event date (not a verified collection date). Source timezone unspecified. No creation-date fallback.',
    eventDatedRows: rows.filter(row => !row.collectedAt).length,
    limitsApplied: false,
};
const data = {metadata, rows, criteria};
const staging = process.argv.indexOf('--staging');
const output = staging >= 0 ? path.resolve(process.argv[staging + 1]) : path.join(project, 'output', 'data');
fs.mkdirSync(output, {recursive: true});
fs.writeFileSync(path.join(output, 'water-results.json'), JSON.stringify(data));
fs.writeFileSync(path.join(output, 'water-results.js'), `window.FWN_WATER = ${JSON.stringify(data).replace(/</g, '\\u003c')};\n`);
fs.writeFileSync(path.join(staging >= 0 ? output : path.join(project, 'docs'), 'extraction-audit.json'), JSON.stringify(metadata, null, 2));
console.log(JSON.stringify(metadata, null, 2));