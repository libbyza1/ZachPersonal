/**
 * server.js — Echelon Dashboard Template: Server Mode Module
 *
 * Responsibilities
 * ────────────────
 *  • Detect whether the dashboard is served by the hosting engine
 *    (any protocol other than file://) or opened as a local file.
 *  • In SERVER MODE:
 *    - Fetch live query data from /api/data before charts render.
 *    - Add a "Refresh" button to the header.
 *    - POST to /api/refresh when the button is clicked, then reload.
 *    - Start an optional auto-refresh countdown timer.
 *  • In FILE MODE:
 *    - Skip all network calls; render with embedded DASHBOARD_CONFIG.data.
 *
 * Load order
 * ──────────
 *  <script src="assets/js/utils.js"></script>
 *  <script src="assets/js/filters.js"></script>
 *  <script src="assets/js/core.js"></script>
 *  <script src="assets/js/charts.js"></script>
 *  <script src="assets/js/server.js"></script>   ← this file (last)
 *
 * Usage in index.html
 * ───────────────────
 *  document.addEventListener('DOMContentLoaded', function () {
 *      DashboardServer.init(DASHBOARD_CONFIG, function (config) {
 *          DashboardCore.init(config);
 *          DashboardCharts.init(config);
 *      });
 *  });
 *
 * Optional config keys (inside DASHBOARD_CONFIG.serverMode)
 * ──────────────────────────────────────────────────────────
 *  autoRefreshMs  {number}  — auto-refresh interval in ms (0 = disabled)
 *                             Example: 15 * 60 * 1000  (every 15 minutes)
 */

(function (global) {
    'use strict';

    var _config       = null;
    var _autoTimer    = null;
    var _isRefreshing = false;
    var _countdown    = null;   // countdown interval ID

    /* ─────────────────────────────────────────────────────────────────
       DETECTION
       ───────────────────────────────────────────────────────────────── */

    function _isServerMode() {
        return window.location.protocol !== 'file:';
    }

    /* ─────────────────────────────────────────────────────────────────
       DOM HELPERS
       ───────────────────────────────────────────────────────────────── */

    function _updateRefreshDisplay(dateStr) {
        var el = document.getElementById('refresh-date');
        if (el) el.textContent = global.DashboardUtils ? DashboardUtils.fmtDateTime(dateStr) : (dateStr || '\u2014');
    }

    function _showRefreshButton() {
        document.body.classList.add('server-mode');
    }

    function _setButtonState(busy) {
        var btn = document.getElementById('refresh-btn');
        if (!btn) return;
        btn.disabled = busy;
        if (busy) {
            btn.classList.add('refreshing');
        } else {
            btn.classList.remove('refreshing');
        }
    }

    /* ─────────────────────────────────────────────────────────────────
       AUTO-REFRESH COUNTDOWN
       ───────────────────────────────────────────────────────────────── */

    function _startCountdown(intervalMs) {
        if (_countdown) clearInterval(_countdown);
        var remaining = Math.round(intervalMs / 1000);
        var span = document.getElementById('refresh-countdown');
        function _tick() {
            remaining -= 1;
            if (span) {
                var m = Math.floor(remaining / 60);
                var s = remaining % 60;
                span.textContent = m > 0
                    ? 'Next: ' + m + 'm ' + (s < 10 ? '0' : '') + s + 's'
                    : 'Next: ' + s + 's';
            }
            if (remaining <= 0) {
                clearInterval(_countdown);
                _countdown = null;
                refresh(true);   // auto-refresh (silent reload)
            }
        }
        _countdown = setInterval(_tick, 1000);
    }

    /* ─────────────────────────────────────────────────────────────────
       FETCH HELPERS
       ───────────────────────────────────────────────────────────────── */

    function _fetchData() {
        return fetch('/api/data', {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        });
    }

    /* ─────────────────────────────────────────────────────────────────
       REFRESH
       ───────────────────────────────────────────────────────────────── */

    /**
     * Trigger a server-side data refresh, then reload the page.
     * @param {boolean} [silent] — if true, don't show the loading overlay.
     */
    function refresh(silent) {
        if (_isRefreshing) return;
        _isRefreshing = true;
        _setButtonState(true);

        if (!silent) {
            var loader = document.getElementById('page-loader');
            if (loader) {
                loader.style.display = 'flex';
                var lbl = loader.querySelector('.loader-label');
                if (lbl) lbl.textContent = 'Refreshing data\u2026';
            }
        }

        fetch('/api/refresh', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
        })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function () {
                // Full page reload picks up the fresh /api/data automatically
                window.location.reload();
            })
            .catch(function (err) {
                console.warn('[DashboardServer] Refresh failed:', err);
                _isRefreshing = false;
                _setButtonState(false);
                var loader = document.getElementById('page-loader');
                if (loader) loader.style.display = 'none';
            });
    }

    /* ─────────────────────────────────────────────────────────────────
       INIT
       ───────────────────────────────────────────────────────────────── */

    /**
     * Initialise the server module.
     *
     * In server mode, fetches live data before calling onReady.
     * In file mode, calls onReady immediately with embedded config data.
     *
     * @param {object}   config   — DASHBOARD_CONFIG from index.html
     * @param {function} onReady  — called with the final config object
     *                             once data is available
     */
    function init(config, onReady) {
        _config = config;

        if (!_isServerMode()) {
            // File mode — use embedded data as-is
            if (typeof onReady === 'function') onReady(config);
            return;
        }

        // Server mode — fetch live data, merge into config, then render
        _fetchData()
            .then(function (result) {
                if (result && result.data) {
                    _config.data = result.data;
                }
                if (result && result.refreshedAt) {
                    _config.refreshDate = result.refreshedAt;
                }
                _renderDashboard(onReady);
            })
            .catch(function (err) {
                console.warn('[DashboardServer] Could not reach /api/data — '
                    + 'rendering with embedded data. (' + err + ')');
                _renderDashboard(onReady);
            });
    }

    function _renderDashboard(onReady) {
        if (typeof onReady === 'function') onReady(_config);

        // After the DOM has been built by core/charts, wire up server features
        setTimeout(function () {
            _showRefreshButton();
            _updateRefreshDisplay(_config.refreshDate);

            var autoMs = (_config.serverMode || {}).autoRefreshMs;
            if (autoMs && autoMs > 0) {
                _autoTimer = setTimeout(function () {
                    refresh(true);
                }, autoMs);
                _startCountdown(autoMs);
            }
        }, 50);
    }

    /* ─────────────────────────────────────────────────────────────────
       EXPORT
       ───────────────────────────────────────────────────────────────── */

    global.DashboardServer = {
        init:    init,
        refresh: refresh,
    };

}(window));
