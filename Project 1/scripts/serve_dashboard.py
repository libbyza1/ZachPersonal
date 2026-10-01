import argparse
import datetime as dt
import functools
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError, NoCredentialsError, PartialCredentialsError
from cycle_audits import build_snapshot, write_snapshot
import okta_login


PROJECT = Path(__file__).resolve().parents[1]
OUTPUT = PROJECT / 'output'
DATABASE = 'adl_enriched_gbl_cf_qualytics_lvlims'
RESULT_BUCKET = 's3://aws-athena-query-results-071970165104-us-east-1/'
REFRESH_LOCK = threading.Lock()
DATA_LOCK = threading.Lock()
REFRESH_TOKEN = secrets.token_urlsafe(32)
EXPIRED_CODES = {'ExpiredTokenException', 'ExpiredToken', 'InvalidClientTokenId',
                 'UnrecognizedClientException', 'RequestExpired'}
AUTH_LOCK = threading.Lock()
AUTH_STATE = {'state': 'idle', 'message': ''}


def auth_status():
    with AUTH_LOCK:
        return dict(AUTH_STATE)


def start_okta_login():
    with AUTH_LOCK:
        if AUTH_STATE['state'] == 'pending':
            return
        AUTH_STATE.update(state='pending', message='Okta verification opened in your browser.')

    def worker():
        try:
            okta_login.renew_credentials()
            result = {'state': 'complete', 'message': 'AWS credentials renewed.'}
        except Exception as error:
            print(f'Okta verification failed: {type(error).__name__}: {error}', flush=True)
            result = {'state': 'failed', 'message': str(error) if isinstance(error, (RuntimeError, TimeoutError))
                      else 'Okta verification failed. Retry Refresh to try again.'}
        with AUTH_LOCK:
            AUTH_STATE.update(result)

    threading.Thread(target=worker, daemon=True).start()


def history_start(today):
    try:
        return today.replace(year=today.year - 3)
    except ValueError:
        return today.replace(year=today.year - 3, day=28)


def query_dates(sql, today):
    return (sql.replace('{{HISTORY_START}}', history_start(today).isoformat())
            .replace('{{END_EXCLUSIVE}}', (today + dt.timedelta(days=1)).isoformat()))


def run_query(client, sql):
    query_id = client.start_query_execution(
        QueryString=sql,
        QueryExecutionContext={'Database': DATABASE},
        ResultConfiguration={'OutputLocation': RESULT_BUCKET},
    )['QueryExecutionId']
    deadline = time.monotonic() + 240
    while True:
        status = client.get_query_execution(QueryExecutionId=query_id)['QueryExecution']['Status']
        if status['State'] == 'SUCCEEDED':
            break
        if status['State'] in ('FAILED', 'CANCELLED'):
            raise RuntimeError(f"Athena {status['State']}; query {query_id}. See Athena query history.")
        if time.monotonic() >= deadline:
            client.stop_query_execution(QueryExecutionId=query_id)
            raise TimeoutError(f'Athena timed out; query {query_id}. Previous snapshot retained.')
        threading.Event().wait(1)
    records = []
    first_row = True
    for page in client.get_paginator('get_query_results').paginate(QueryExecutionId=query_id):
        for row in page['ResultSet']['Rows']:
            if first_row:
                first_row = False
                continue
            payload = row['Data'][0].get('VarCharValue')
            if payload:
                batch = json.loads(payload)
                if not isinstance(batch, list):
                    raise ValueError('Unexpected Athena payload type.')
                records.extend(batch)
    return query_id, records


def refresh_snapshot():
    today = dt.datetime.now(dt.timezone.utc).date()
    session = boto3.Session(profile_name='foresight', region_name='us-east-1')
    client = session.client('athena', config=Config(connect_timeout=15, read_timeout=60,
                                                   retries={'max_attempts': 3}))
    query_id, records = run_query(client, query_dates(
        (PROJECT / 'docs/water-results.sql').read_text(encoding='utf-8'), today))
    criteria_id, criteria_records = run_query(client, query_dates(
        (PROJECT / 'docs/acceptance-criteria.sql').read_text(encoding='utf-8'), today))
    if not records or not criteria_records:
        raise ValueError('Refresh returned an empty result or specification dataset. Previous snapshot retained.')
    audit_id, audit_records = run_query(client, query_dates(
        (PROJECT / 'docs/cycle-audits.sql').read_text(encoding='utf-8'), today))
    audits = build_snapshot(audit_records, {
        'queryId': audit_id, 'asOf': today.isoformat(),
        'historyStart': history_start(today).isoformat(),
        'extractedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
    })
    if not audits['rows']:
        raise ValueError('Refresh returned no usable cycle audits. Previous snapshot retained.')
    source = {'asOf': today.isoformat(), 'extractedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
              'queryId': query_id, 'criteriaQueryId': criteria_id,
              'records': records, 'criteriaRecords': criteria_records}
    with tempfile.TemporaryDirectory(prefix='.refresh-', dir=PROJECT) as temporary:
        staging = Path(temporary)
        source_path = staging / 'refresh-source.json'
        source_path.write_text(json.dumps(source, ensure_ascii=False), encoding='utf-8')
        result = subprocess.run(
            ['node', str(PROJECT / 'scripts/import_results.cjs'), str(source_path),
             '--json', '--staging', str(staging)],
            capture_output=True, text=True, timeout=120, check=False,
        )
        if result.returncode:
            raise ValueError('Refreshed data failed importer validation. Previous snapshot retained.')
        data = json.loads((staging / 'water-results.json').read_text(encoding='utf-8'))
        if not data.get('criteria'):
            raise ValueError('No matching result specifications. Previous snapshot retained.')
        write_snapshot(audits, staging)
        (staging / 'cycle-audit-extraction.json').write_text(json.dumps({
            'metadata': audits['metadata'], 'issues': audits['issues']
        }, indent=2), encoding='utf-8')
        publications = {
            OUTPUT / 'data/water-results.json': staging / 'water-results.json',
            OUTPUT / 'data/water-results.js': staging / 'water-results.js',
            PROJECT / 'docs/extraction-audit.json': staging / 'extraction-audit.json',
            PROJECT / 'docs/refresh-source.json': source_path,
            OUTPUT / 'data/cycle-audits.json': staging / 'cycle-audits.json',
            OUTPUT / 'data/cycle-audits.js': staging / 'cycle-audits.js',
            PROJECT / 'docs/cycle-audit-extraction.json': staging / 'cycle-audit-extraction.json',
        }
        with DATA_LOCK:
            backups = {target: target.read_bytes() if target.exists() else None for target in publications}
            try:
                for target, staged in publications.items():
                    os.replace(staged, target)
            except OSError:
                for target, previous in backups.items():
                    if previous is None:
                        target.unlink(missing_ok=True)
                    else:
                        target.write_bytes(previous)
                raise
    return {**data, 'audits': audits}


class DashboardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(OUTPUT), **kwargs)

    @property
    def expected_host(self):
        return f'127.0.0.1:{self.server.server_port}'

    def valid_host(self):
        return self.headers.get('Host') == self.expected_host

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def respond(self, status, value):
        payload = json.dumps(value, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if not self.valid_host():
            self.respond(403, {'error': 'Untrusted host.'})
            return
        route = urlsplit(self.path).path
        if route == '/api/status':
            self.respond(200, {'refreshToken': REFRESH_TOKEN, 'database': DATABASE})
        elif route == '/api/auth':
            self.respond(200, auth_status())
        elif route == '/api/data':
            with DATA_LOCK:
                data = json.loads((OUTPUT / 'data/water-results.json').read_text(encoding='utf-8'))
            self.respond(200, data)
        elif route.startswith('/api/'):
            self.respond(404, {'error': 'Unknown endpoint.'})
        else:
            target = Path(self.translate_path(self.path)).resolve()
            if not target.is_relative_to(OUTPUT.resolve()) or (target.is_dir() and target != OUTPUT.resolve()):
                self.respond(403, {'error': 'Access denied.'})
                return
            with DATA_LOCK:
                super().do_GET()

    def do_POST(self):
        if (not self.valid_host()
                or self.headers.get('Origin') not in (None, f'http://{self.expected_host}')
                or not secrets.compare_digest(self.headers.get('X-FWN-Refresh', ''), REFRESH_TOKEN)):
            self.respond(403, {'error': 'Refresh request not authorized.'})
            return
        if self.path != '/api/refresh':
            self.respond(404, {'error': 'Unknown endpoint.'})
            return
        if not REFRESH_LOCK.acquire(blocking=False):
            self.respond(409, {'error': 'A refresh is already running.'})
            return
        try:
            data = refresh_snapshot()
            self.respond(200, data)
        except (ClientError, NoCredentialsError, PartialCredentialsError) as error:
            code = error.response.get('Error', {}).get('Code', '') if isinstance(error, ClientError) else 'NoCredentials'
            if code in EXPIRED_CODES or code == 'NoCredentials':
                start_okta_login()
                self.respond(401, {'error': 'AWS session expired. Complete the Okta verification opened in '
                                            'your browser. Previous snapshot retained.',
                                   'authRequired': True})
            else:
                self.respond(502, {'error': 'AWS query failed. Check profile foresight permissions and Athena '
                                            'query history. Previous snapshot retained.'})
        except Exception as error:
            print(f'Refresh failed: {type(error).__name__}: {error}', flush=True)
            self.respond(500, {'error': str(error) if isinstance(error, (ValueError, RuntimeError, TimeoutError))
                              else 'Refresh failed. Check the local service. Previous snapshot retained.'})
        finally:
            REFRESH_LOCK.release()


class DashboardServer(ThreadingHTTPServer):
    # Windows SO_REUSEADDR lets another dashboard silently share the port.
    allow_reuse_address = False

    def server_bind(self):
        if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    for port in range(args.port, args.port + 20):
        try:
            server = DashboardServer(('127.0.0.1', port), DashboardHandler)
            break
        except OSError:
            continue
    else:
        raise RuntimeError('No available local port; choose --port explicitly.')
    print(f'FWN dashboard: http://127.0.0.1:{server.server_port}/', flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == '__main__':
    main()