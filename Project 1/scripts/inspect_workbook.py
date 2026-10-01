import collections
import json
from pathlib import Path

import xlrd


def inspect_workbook(path):
    book = xlrd.open_workbook(str(path))
    sheet = book.sheet_by_index(0)
    if not sheet.nrows:
        return {'file': path.name, 'rows': 0, 'empty': True}
    headers = sheet.row_values(0)
    audit_columns = [header for header in headers
                     if any(parameter in str(header).upper()
                            for parameter in ('CYCLE AUDIT', 'CYCLE RESULTS'))]
    if audit_columns:
        records = [dict(zip(headers, sheet.row_values(index)))
                   for index in range(1, sheet.nrows)]
        return {
            'file': path.name, 'rows': len(records), 'headers': headers,
            'samples': len({row.get('Sample Description') for row in records}),
            'audit_columns': audit_columns,
            'outcomes': dict(collections.Counter(
                str(row[column]).strip().upper() for row in records for column in audit_columns)),
            'examples': records[:2],
        }
    expected = ['Monitor Group', 'Label', 'Sample', 'Samplepoint',
                'Sample Location Path', 'Paramlist', 'param', 'Result Value',
                'Result Units', 'Samplepoint Description']
    assert headers == expected, headers
    rows = [dict(zip(headers, sheet.row_values(index)))
            for index in range(1, sheet.nrows)]
    valid = [row for row in rows if str(row['Sample']).startswith('S-')
             and str(row['Samplepoint']).startswith('SP-')]
    return {
        'file': path.name,
        'rows': len(rows),
        'sample_rows': len(valid),
        'malformed_or_continuation_rows': len(rows) - len(valid),
        'samples': len({row['Sample'] for row in valid}),
        'parameters': dict(collections.Counter(row['param'] for row in valid)),
        'samplepoints': sorted({row['Samplepoint'] for row in valid}),
        'paths': sorted({row['Sample Location Path'] for row in valid}),
    }


if __name__ == '__main__':
    project = Path(__file__).resolve().parents[1]
    print(json.dumps([inspect_workbook(workbook)
                      for workbook in sorted((project / 'data').glob('*.xls'))], indent=2))