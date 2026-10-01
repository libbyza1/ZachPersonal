import collections
import datetime as dt
import json
import re
from pathlib import Path


FIELDS = ('sample', 'description', 'status', 'equipmentRaw', 'cycleDescription',
          'method', 'version', 'variant', 'dataset', 'parameter', 'parameterType',
          'replicate', 'raw', 'released', 'modifiedAt', 'testAt', 'testDateRaw')


def equipment_identity(value):
    match = re.match(r'^\s*(\d{1,2})\s*-\s*\S', value or '')
    if not match:
        return None
    number = int(match.group(1))
    if not number:
        return None
    return ('Oven' if number in (18, 29, 32) else 'Sterilizer', number)


def build_snapshot(records, metadata):
    samples = collections.defaultdict(list)
    excluded = collections.Counter()
    issues = []
    for values in records:
        if len(values) != len(FIELDS):
            raise ValueError('Unexpected cycle audit schema.')
        record = dict(zip(FIELDS, values))
        outcome = (record['raw'] or '').strip().upper()
        if outcome not in ('PASS', 'FAIL'):
            excluded['blankOrOtherResultRows'] += 1
            continue
        if record['released'] != 'Y':
            excluded['unreleasedResultRows'] += 1
            continue
        record['outcome'] = outcome
        samples[record['sample']].append(record)
    rows = []
    for sample, candidates in sorted(samples.items()):
        identities = {equipment_identity(record['description']) for record in candidates}
        dates = {(record['testAt'] or '')[:10] for record in candidates}
        outcomes = {record['outcome'] for record in candidates}
        reason = None
        if len(outcomes) != 1:
            reason = 'Conflicting Pass/Fail results'
        elif len(identities) != 1 or None in identities:
            reason = 'Missing or ambiguous cycle-number prefix'
        elif len(dates) != 1 or '' in dates:
            reason = 'Missing or conflicting test dates'
        if reason:
            issues.append({'sample': sample, 'reason': reason, 'results': candidates})
            continue
        date = next(iter(dates))
        dt.date.fromisoformat(date)
        if not metadata['historyStart'] <= date <= metadata['asOf']:
            excluded['outsideWindowSamples'] += 1
            continue
        kind, number = next(iter(identities))
        latest = max(candidates, key=lambda record: record['modifiedAt'] or '')
        rows.append({**latest, 'date': date, 'kind': kind, 'number': number,
                     'equipment': f'{kind} {number}', 'dateBasis': 'LIMS TEST DATE',
                     'equipmentBasis': 'Cycle-number prefix (sample description)',
                     'methods': sorted({record['method'] for record in candidates}),
                     'sourceResultCount': len(candidates), 'sourceResults': candidates})
        excluded['duplicatePassFailRowsCollapsed'] += len(candidates) - 1
    counts = collections.Counter((row['kind'], row['number'], row['outcome']) for row in rows)
    return {'metadata': {**metadata, 'database': 'adl_enriched_gbl_cf_qualytics_lvlims',
                         'equipmentBasis': 'Cycle-number prefix; ovens 18, 29, 32',
                         'rawResultRows': len(records), 'auditedSamples': len(rows),
                         'excluded': dict(excluded), 'issueSamples': len(issues),
                         'counts': [[*key, value] for key, value in sorted(counts.items())]},
            'rows': sorted(rows, key=lambda row: (row['date'], row['sample'])), 'issues': issues}


def write_snapshot(data, directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=True)
    (directory / 'cycle-audits.json').write_text(payload, encoding='utf-8')
    (directory / 'cycle-audits.js').write_text('window.FWN_AUDITS = ' + payload + ';\n', encoding='utf-8')


if __name__ == '__main__':
    import boto3
    from serve_dashboard import PROJECT, history_start, query_dates, run_query

    today = dt.datetime.now(dt.timezone.utc).date()
    client = boto3.Session(profile_name='foresight', region_name='us-east-1').client('athena')
    query_id, records = run_query(client, query_dates(
        (PROJECT / 'docs/cycle-audits.sql').read_text(encoding='utf-8'), today))
    snapshot = build_snapshot(records, {
        'queryId': query_id, 'asOf': today.isoformat(),
        'historyStart': history_start(today).isoformat(),
        'extractedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
    })
    if not snapshot['rows']:
        raise ValueError('No usable cycle audits; previous snapshot retained.')
    write_snapshot(snapshot, PROJECT / 'output/data')
    (PROJECT / 'docs/cycle-audit-extraction.json').write_text(
        json.dumps({'metadata': snapshot['metadata'], 'issues': snapshot['issues']}, indent=2),
        encoding='utf-8')
    print(json.dumps(snapshot['metadata'], indent=2))