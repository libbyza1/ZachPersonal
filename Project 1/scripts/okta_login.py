"""Okta SAML -> AWS credential renewal for the production `foresight` profile."""
import configparser
from http.server import BaseHTTPRequestHandler, HTTPServer
import os
from pathlib import Path
import tempfile
import threading
from urllib.parse import parse_qs
import webbrowser

import boto3
from botocore import UNSIGNED
from botocore.config import Config

# Non-secret production values shared with the Echelon S3 MCP configuration.
PROFILE = 'foresight'
REGION = 'us-east-1'
LOGIN_URL = 'https://alcon.okta.com/app/alcon_foresightanalytics_1/exkn5ymqibMBtIirv357/sso/saml'
LISTEN_PORT = 7890
ROLE_ARN = 'arn:aws:iam::071970165104:role/Athena-LakeFormation-OktaRole'
PRINCIPAL_ARN = 'arn:aws:iam::071970165104:saml-provider/AthenaLakeFormationOkta'
DURATION_SECONDS = 43200
LOGIN_TIMEOUT_SECONDS = 300
MAX_BODY_BYTES = 1_000_000
CREDENTIALS_PATH = Path.home() / '.aws' / 'credentials'


def capture_saml_assertion(timeout=LOGIN_TIMEOUT_SECONDS):
    received = {}
    done = threading.Event()

    class SAMLHandler(BaseHTTPRequestHandler):
        def do_POST(self):
            length = int(self.headers.get('Content-Length') or 0)
            if length <= 0 or length > MAX_BODY_BYTES:
                self.send_error(400)
                return
            assertion = parse_qs(self.rfile.read(length).decode('utf-8')).get('SAMLResponse', [None])[0]
            if not assertion:
                self.send_error(400)
                return
            received['assertion'] = assertion
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(b"<html><body style='font-family:sans-serif;text-align:center;margin-top:80px'>"
                             b"<h2>Okta verification complete.</h2><p>Close this tab and return to the "
                             b"FWN dashboard; the refresh will continue automatically.</p></body></html>")
            done.set()

        def log_message(self, *args):
            pass

    try:
        server = HTTPServer(('127.0.0.1', LISTEN_PORT), SAMLHandler)
    except OSError as error:
        raise RuntimeError(f'Okta callback port {LISTEN_PORT} is in use. Close other Okta/AWS login '
                           'tools, then retry.') from error
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        if not webbrowser.open(LOGIN_URL):
            raise RuntimeError('Could not open a browser for Okta verification.')
        if not done.wait(timeout):
            raise TimeoutError('Okta verification timed out.')
    finally:
        server.shutdown()
        server.server_close()
    return received['assertion']


def assume_role(assertion):
    config = Config(signature_version=UNSIGNED, region_name=REGION)
    request = {'RoleArn': ROLE_ARN, 'PrincipalArn': PRINCIPAL_ARN,
               'SAMLAssertion': assertion, 'DurationSeconds': DURATION_SECONDS}
    try:
        return boto3.client('lakeformation', config=config).assume_decorated_role_with_saml(**request)
    except Exception:
        return boto3.client('sts', config=config).assume_role_with_saml(**request)['Credentials']


def write_credentials(credentials, path=CREDENTIALS_PATH):
    path.parent.mkdir(parents=True, exist_ok=True)
    parser = configparser.ConfigParser()
    parser.read(path)
    if not parser.has_section(PROFILE):
        parser.add_section(PROFILE)
    parser[PROFILE]['region'] = REGION
    parser[PROFILE]['aws_access_key_id'] = credentials['AccessKeyId']
    parser[PROFILE]['aws_secret_access_key'] = credentials['SecretAccessKey']
    parser[PROFILE]['aws_session_token'] = credentials['SessionToken']
    descriptor, temporary = tempfile.mkstemp(prefix='.credentials-', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as handle:
            parser.write(handle)
        os.replace(temporary, path)
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise


def renew_credentials():
    write_credentials(assume_role(capture_saml_assertion()))


if __name__ == '__main__':
    renew_credentials()
    print(f'AWS credentials renewed for profile {PROFILE}.')
