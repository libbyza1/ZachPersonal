import argparse
import csv
import json
from pathlib import Path

from playwright.sync_api import sync_playwright


PROJECT = Path(__file__).resolve().parents[1]


def verify(url):
    errors = []
    snapshot = json.loads((PROJECT / 'output/data/cycle-audits.json').read_text(encoding='utf-8'))
    with sync_playwright() as runtime:
        browser = runtime.chromium.launch(channel='msedge', headless=True)
        page = browser.new_page(viewport={'width': 1440, 'height': 1000})
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(url, wait_until='networkidle')
        def expected_summary(equipment):
            start = page.locator('#audit-start').input_value()
            end = page.locator('#audit-end').input_value()
            rows = [row for row in snapshot['rows'] if row['equipment'] == equipment and start <= row['date'] <= end]
            failed = sum(row['outcome'] == 'FAIL' for row in rows)
            return f'{failed:,} failed / {len(rows):,} audited', failed

        assert page.locator('#sterilizer-select option').count() > 2
        assert page.locator('#oven-select option').all_text_contents() == [
            'Select oven', 'All ovens', 'Oven 18', 'Oven 29', 'Oven 32']
        assert 'Sterilizer 32' not in page.locator('#sterilizer-select option').all_text_contents()
        page.select_option('#sterilizer-select', 'Sterilizer 28')
        page.wait_for_selector('#audit-trend .apexcharts-marker')
        assert page.locator('.tab-content:visible').count() == 0
        assert expected_summary('Sterilizer 28')[0] in page.locator('#audit-range').inner_text()
        assert 'N/A' in page.locator('#audit-metrics .metric').nth(3).inner_text()
        page.screenshot(path=str(PROJECT / 'docs/cycle-audits-desktop.png'), full_page=True)
        content_buttons = page.locator('#audit-contents button')
        assert content_buttons.count() > 1
        assert page.locator('#audit-contents button[aria-pressed="true"]').count() == content_buttons.count()
        page.locator('#audit-content-none').click()
        assert 'No audited cycles' in page.locator('#audit-range').inner_text()
        assert page.locator('#audit-contents button[aria-pressed="true"]').count() == 0
        equipment_button = page.get_by_role('button', name='EQUIPMENT', exact=True)
        equipment_button.focus()
        equipment_button.press('Space')
        assert equipment_button.get_attribute('aria-pressed') == 'true'
        assert page.evaluate("FWN_TEST.auditStates.Sterilizer.contents") == ['EQUIPMENT']
        expected_contents = page.evaluate("""() => {
            const state = FWN_TEST.auditStates.Sterilizer;
            const rows = FWN_AUDITS.rows.filter(row => row.equipment === 'Sterilizer 28'
                && row.date >= state.start && row.date <= state.end && FWN_TEST.auditContent(row) === 'EQUIPMENT');
            return {total: rows.length, failed: rows.filter(row => row.outcome === 'FAIL').length};
        }""")
        page.wait_for_function("expected => Tabulator.findTable('#audit-table')[0].getData().length === expected", arg=expected_contents['total'])
        assert f"{expected_contents['failed']:,} failed / {expected_contents['total']:,} audited" in page.locator('#audit-range').inner_text()
        assert page.evaluate("auditTrend.w.config.series.reduce((total, series) => total + series.data.length, 0)") == expected_contents['total']
        assert page.evaluate("auditMonthly.w.config.series.reduce((total, series) => total + series.data.reduce((sum, value) => sum + value, 0), 0)") == expected_contents['total']
        with page.expect_download() as content_download:
            page.locator('#audit-json').click()
        content_payload = json.loads(Path(content_download.value.path()).read_text(encoding='utf-8'))
        assert content_payload['selection']['contents'] == ['EQUIPMENT']
        assert len(content_payload['rows']) == expected_contents['total']
        assert all(' '.join((row['cycleDescription'] or '').split()).upper() == 'EQUIPMENT' for row in content_payload['rows'])
        with page.expect_download() as content_csv:
            page.locator('#audit-csv').click()
        with open(content_csv.value.path(), encoding='utf-8-sig', newline='') as source:
            content_rows = list(csv.DictReader(source))
        assert len(content_rows) == expected_contents['total']
        page.get_by_role('button', name='AIR REMOVAL TEST', exact=True).click()
        assert page.locator('#audit-contents button[aria-pressed="true"]').count() == 2
        page.select_option('#sterilizer-select', 'Sterilizer 3')
        page.wait_for_selector('#audit-trend .apexcharts-marker')
        assert page.locator('#audit-contents button[aria-pressed="true"]').count() == page.locator('#audit-contents button').count()
        page.select_option('#sterilizer-select', 'Sterilizer 28')
        page.wait_for_selector('#audit-trend .apexcharts-marker')
        assert page.locator('#audit-contents button[aria-pressed="true"]').count() == 2
        page.screenshot(path=str(PROJECT / 'docs/cycle-contents-desktop.png'), full_page=True)
        page.set_viewport_size({'width': 390, 'height': 844})
        page.wait_for_function("document.documentElement.scrollWidth <= innerWidth")
        page.screenshot(path=str(PROJECT / 'docs/cycle-contents-mobile.png'), full_page=True)
        page.set_viewport_size({'width': 1440, 'height': 1000})
        page.locator('#audit-content-all').click()
        assert expected_summary('Sterilizer 28')[0] in page.locator('#audit-range').inner_text()
        page.select_option('#audit-month', '2026-09')
        page.wait_for_function("Tabulator.findTable('#audit-table')[0].getData().every(row => row.date.startsWith('2026-09'))")
        assert 'Month: 2026-09' in page.locator('#audit-range').inner_text()
        page.locator('#audit-clear').click()
        page.locator('#audit-start').fill('2026-01-01')
        page.locator('#audit-start').press('Tab')
        assert page.evaluate("FWN_TEST.auditStates.Sterilizer.start") == '2026-01-01'
        page.locator('#audit-from-slider').focus()
        page.locator('#audit-from-slider').press('ArrowRight')
        page.locator('#audit-from-slider').press('Tab')
        assert page.evaluate("FWN_TEST.auditStates.Sterilizer.start") == '2026-01-02'
        page.locator('#audit-reset').click()
        page.select_option('#oven-select', 'Oven 29')
        page.wait_for_selector('#audit-trend .apexcharts-marker')
        assert page.locator('#audit-contents').count() == 0
        assert page.locator('#sterilizer-select').input_value() == ''
        assert expected_summary('Oven 29')[0] in page.locator('#audit-range').inner_text()
        expected_failures = expected_summary('Oven 29')[1]
        page.locator('#audit-table button').first.click()
        assert page.locator('#sample-detail').is_visible()
        assert 'Oven 29' in page.locator('#sample-title').inner_text()
        page.locator('#drill-line').click()
        page.wait_for_selector('#audit-trend .apexcharts-marker')
        assert not page.locator('#sample-detail').is_visible()
        page.evaluate("Tabulator.findTable('#audit-table')[0].setHeaderFilterValue('outcome', 'FAIL')")
        page.wait_for_function("expected => Tabulator.findTable('#audit-table')[0].getData('active').length === expected", arg=expected_failures)
        with page.expect_download() as csv_download:
            page.locator('#audit-csv').click()
        with open(csv_download.value.path(), encoding='utf-8-sig', newline='') as source:
            rows = list(csv.DictReader(source))
        assert len(rows) == expected_failures and all(row['outcome'] == 'FAIL' for row in rows)
        with page.expect_download() as json_download:
            page.locator('#audit-json').click()
        payload = json.loads(Path(json_download.value.path()).read_text(encoding='utf-8'))
        assert len(payload['rows']) == expected_failures
        assert len({row['sample'] for row in payload['rows']}) == expected_failures
        page.locator('#audit-clear').click()
        page.locator('#audit-start').fill('2026-09-29')
        page.locator('#audit-start').press('Tab')
        assert 'No audited cycles' in page.locator('#audit-range').inner_text()
        assert 'N/A' in page.locator('#audit-metrics').inner_text()
        page.locator('#audit-reset').click()
        page.select_option('#oven-select', 'Oven 32')
        page.wait_for_selector('#audit-trend .apexcharts-marker')
        assert '1 failed / 2 audited' in page.locator('#audit-range').inner_text()
        assert page.evaluate("Tabulator.findTable('#audit-table')[0].getData().every(row => row.description.startsWith('32-') && row.kind === 'Oven')")
        page.screenshot(path=str(PROJECT / 'docs/cycle-audits-oven32.png'), full_page=True)
        page.select_option('#utility-select', 'WFI')
        assert not page.locator('#audit-view').is_visible()
        assert page.locator('.tab-content:visible').count() == 1
        assert page.locator('#oven-select').input_value() == ''
        page.select_option('#oven-select', 'Oven 18')
        page.wait_for_selector('#audit-trend .apexcharts-marker')
        page.set_viewport_size({'width': 390, 'height': 844})
        page.wait_for_function("document.documentElement.scrollWidth <= innerWidth")
        assert page.locator('#oven-select').bounding_box()['width'] <= 390
        page.screenshot(path=str(PROJECT / 'docs/cycle-audits-mobile.png'), full_page=True)
        page.locator('#theme-toggle').click()
        page.wait_for_selector('#audit-trend .apexcharts-marker')
        assert page.locator('#audit-view').is_visible()
        assert not errors, errors
        browser.close()
    print('PASS: audit dropdowns, cycle-content multi-selection and retention, charts, summary, month/date/slider filters, filtered exports, details, empty state, utility navigation, mobile layout and theme; no page errors.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8770/')
    verify(parser.parse_args().url)