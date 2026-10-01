import datetime as dt
import hashlib
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import serve_dashboard as service
from cycle_audits import build_snapshot, equipment_identity


class CycleAuditTests(unittest.TestCase):
    def test_equipment(self):
        self.assertEqual(equipment_identity('03-26092901'), ('Sterilizer', 3))
        self.assertEqual(equipment_identity('18-26092901'), ('Oven', 18))
        self.assertEqual(equipment_identity('29-26092901'), ('Oven', 29))
        self.assertEqual(equipment_identity('32-24121815'), ('Oven', 32))
        self.assertEqual(equipment_identity('28-23033121'), ('Sterilizer', 28))
        self.assertEqual(equipment_identity(' 26--2608130530 '), ('Sterilizer', 26))
        self.assertIsNone(equipment_identity('3|28'))
        self.assertIsNone(equipment_identity('326-2407101508'))
        self.assertIsNone(equipment_identity('[cycle number]'))
        self.assertIsNone(equipment_identity('32'))

    def test_unique_nonblank_audits(self):
        metadata = {'historyStart': '2023-09-29', 'asOf': '2026-09-29'}
        record = ['S-1', '3-cycle', 'Reviewed', '3', 'Components', 'Method A', '1',
                  'variant', '1', 'CYCLE AUDIT', 'Any', '1', 'PASS', 'Y',
                  '2026-09-22', '2026-09-20 00:00:00', 'Sep 20, 2026']
        duplicate = record.copy()
        duplicate[5] = 'Method B'
        blank = record.copy()
        blank[12] = None
        data = build_snapshot([record, duplicate, blank], metadata)
        self.assertEqual(len(data['rows']), 1)
        self.assertEqual(data['rows'][0]['sourceResultCount'], 2)
        self.assertEqual(data['metadata']['excluded']['blankOrOtherResultRows'], 1)
        failed = duplicate.copy()
        failed[12] = 'FAIL'
        data = build_snapshot([record, failed, blank], metadata)
        self.assertEqual(data['rows'], [])
        self.assertEqual(data['issues'][0]['reason'], 'Conflicting Pass/Fail results')
        failed[0] = 'S-2'
        failed[1] = '29-cycle'
        failed[3] = 'Oven 29'
        data = build_snapshot([record, failed], metadata)
        self.assertEqual(len(data['rows']), 2)
        self.assertEqual(sum(row['outcome'] == 'FAIL' for row in data['rows']), 1)
        record[1] = '32-24121815'
        record[3] = '15'
        data = build_snapshot([record], metadata)
        self.assertEqual(data['rows'][0]['equipment'], 'Oven 32')
        self.assertEqual(data['rows'][0]['equipmentRaw'], '15')
        record[1] = '[cycle number]'
        record[3] = '32'
        data = build_snapshot([record], metadata)
        self.assertEqual(data['rows'], [])
        self.assertEqual(data['issues'][0]['reason'], 'Missing or ambiguous cycle-number prefix')


class RefreshTests(unittest.TestCase):
    def exercise_publication(self, fail_publication=False):
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory)
            output = project / 'output'
            (project / 'docs').mkdir()
            (output / 'data').mkdir(parents=True)
            for name in ('water-results.sql', 'acceptance-criteria.sql', 'cycle-audits.sql'):
                (project / 'docs' / name).write_text('SELECT 1', encoding='utf-8')
            targets = [output / 'data' / name for name in (
                'water-results.json', 'water-results.js', 'cycle-audits.json', 'cycle-audits.js')]
            targets += [project / 'docs' / name for name in (
                'extraction-audit.json', 'refresh-source.json', 'cycle-audit-extraction.json')]
            for target in targets:
                target.write_text('previous', encoding='utf-8')
            today = dt.datetime.now(dt.timezone.utc).date().isoformat()
            record = ['S-1', '18-cycle', 'Reviewed', '18', 'Components', 'PASS/FAIL CYCLE REQUEST',
                      '1', 'variant', '1', 'CYCLE RESULTS', 'Any', '1', 'FAIL', 'Y',
                      today, today + ' 00:00:00', today]

            def import_fixture(command, **kwargs):
                staging = Path(command[-1])
                (staging / 'water-results.json').write_text(json.dumps({'rows': [{}], 'criteria': [{}]}))
                (staging / 'water-results.js').write_text('water')
                (staging / 'extraction-audit.json').write_text('{}')
                return MagicMock(returncode=0)

            original_replace = service.os.replace

            def replace_fixture(source, target):
                if fail_publication and Path(target).name == 'cycle-audits.js':
                    raise OSError('Simulated publication failure')
                original_replace(source, target)

            with patch.object(service, 'PROJECT', project), patch.object(service, 'OUTPUT', output), \
                    patch.object(service.boto3, 'Session'), \
                    patch.object(service, 'run_query', side_effect=[('water', [{}]), ('criteria', [{}]), ('audits', [record])]), \
                    patch.object(service.subprocess, 'run', side_effect=import_fixture), \
                    patch.object(service.os, 'replace', side_effect=replace_fixture):
                if fail_publication:
                    with self.assertRaises(OSError):
                        service.refresh_snapshot()
                    self.assertTrue(all(target.read_text() == 'previous' for target in targets))
                else:
                    result = service.refresh_snapshot()
                    self.assertEqual(result['audits']['rows'][0]['outcome'], 'FAIL')
                    self.assertEqual(json.loads((output / 'data/cycle-audits.json').read_text()), result['audits'])

    def test_combined_refresh_publication(self):
        self.exercise_publication()

    def test_combined_refresh_rollback(self):
        self.exercise_publication(fail_publication=True)

    def test_query_dates(self):
        sql = service.query_dates('{{HISTORY_START}} {{END_EXCLUSIVE}}', dt.date(2024, 2, 29))
        self.assertEqual(sql, '2021-02-28 2024-03-01')

    def test_pagination(self):
        client = MagicMock()
        client.start_query_execution.return_value = {'QueryExecutionId': 'query-id'}
        client.get_query_execution.return_value = {'QueryExecution': {'Status': {'State': 'SUCCEEDED'}}}
        client.get_paginator.return_value.paginate.return_value = [
            {'ResultSet': {'Rows': [{'Data': [{'VarCharValue': 'payload'}]},
                                    {'Data': [{'VarCharValue': '[["first"]]'}]}]}},
            {'ResultSet': {'Rows': [{'Data': [{'VarCharValue': '[["second"]]'}]}]}},
        ]
        query_id, rows = service.run_query(client, 'SELECT 1')
        self.assertEqual(query_id, 'query-id')
        self.assertEqual(rows, [['first'], ['second']])

    def test_failed_query(self):
        client = MagicMock()
        client.start_query_execution.return_value = {'QueryExecutionId': 'failed-query'}
        client.get_query_execution.return_value = {'QueryExecution': {'Status': {'State': 'FAILED'}}}
        with self.assertRaisesRegex(RuntimeError, 'failed-query'):
            service.run_query(client, 'SELECT 1')
        client.get_paginator.assert_not_called()

    def test_timeout_cancels_query(self):
        client = MagicMock()
        client.start_query_execution.return_value = {'QueryExecutionId': 'timeout-query'}
        client.get_query_execution.return_value = {'QueryExecution': {'Status': {'State': 'RUNNING'}}}
        with patch.object(service.time, 'monotonic', side_effect=[0, 241]):
            with self.assertRaises(TimeoutError):
                service.run_query(client, 'SELECT 1')
        client.stop_query_execution.assert_called_once_with(QueryExecutionId='timeout-query')


class EndpointTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = service.ThreadingHTTPServer(('127.0.0.1', 0), service.DashboardHandler)
        cls.worker = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.worker.start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.worker.join()

    def request(self, path, headers=None, method='GET'):
        request = Request(self.base + path, headers=headers or {}, method=method)
        try:
            with urlopen(request, timeout=10) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            return error.code, json.load(error)

    def test_cross_origin_and_missing_token(self):
        with patch.object(service, 'refresh_snapshot') as refresh:
            self.assertEqual(self.request('/api/refresh', method='POST')[0], 403)
            self.assertEqual(self.request('/api/refresh', {
                'X-FWN-Refresh': service.REFRESH_TOKEN, 'Origin': 'https://example.com'
            }, 'POST')[0], 403)
            refresh.assert_not_called()

    def test_host_and_directory_protection(self):
        self.assertEqual(self.request('/api/status', {'Host': 'untrusted.example'})[0], 403)
        self.assertEqual(self.request('/assets/')[0], 403)

    def test_busy_refresh(self):
        with service.REFRESH_LOCK:
            status, data = self.request('/api/refresh', {'X-FWN-Refresh': service.REFRESH_TOKEN}, 'POST')
        self.assertEqual(status, 409)
        self.assertIn('already running', data['error'])

    def test_failure_preserves_snapshot(self):
        snapshot = service.OUTPUT / 'data/water-results.json'
        before = hashlib.sha256(snapshot.read_bytes()).hexdigest()
        with patch.object(service, 'refresh_snapshot', side_effect=ValueError('Validation failed. Previous snapshot retained.')):
            status, data = self.request('/api/refresh', {'X-FWN-Refresh': service.REFRESH_TOKEN}, 'POST')
        self.assertEqual(status, 500)
        self.assertIn('retained', data['error'])
        self.assertEqual(hashlib.sha256(snapshot.read_bytes()).hexdigest(), before)
        self.assertFalse(service.REFRESH_LOCK.locked())

    def test_expired_session_starts_okta(self):
        expired = service.ClientError({'Error': {'Code': 'ExpiredTokenException'}}, 'StartQueryExecution')
        renewed = threading.Event()
        with patch.object(service, 'refresh_snapshot', side_effect=expired), \
                patch.object(service.okta_login, 'renew_credentials', side_effect=renewed.set):
            status, data = self.request('/api/refresh', {'X-FWN-Refresh': service.REFRESH_TOKEN}, 'POST')
            self.assertEqual(status, 401)
            self.assertTrue(data['authRequired'])
            self.assertTrue(renewed.wait(5))
        for _ in range(50):
            if service.auth_status()['state'] != 'pending':
                break
            threading.Event().wait(0.1)
        self.assertEqual(self.request('/api/auth')[1]['state'], 'complete')

    def test_access_denied_does_not_start_okta(self):
        denied = service.ClientError({'Error': {'Code': 'AccessDeniedException'}}, 'StartQueryExecution')
        with patch.object(service, 'refresh_snapshot', side_effect=denied), \
                patch.object(service, 'start_okta_login') as login:
            status, _ = self.request('/api/refresh', {'X-FWN-Refresh': service.REFRESH_TOKEN}, 'POST')
        self.assertEqual(status, 502)
        login.assert_not_called()


class OktaLoginTests(unittest.TestCase):
    def test_write_credentials_preserves_other_profiles(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'credentials'
            path.write_text('[default]\nregion = us-east-1\n', encoding='utf-8')
            service.okta_login.write_credentials(
                {'AccessKeyId': 'a', 'SecretAccessKey': 'b', 'SessionToken': 'c'}, path)
            text = path.read_text(encoding='utf-8')
            self.assertIn('[default]', text)
            self.assertIn('[foresight]', text)
            self.assertIn('aws_session_token = c', text)


if __name__ == '__main__':
    unittest.main()