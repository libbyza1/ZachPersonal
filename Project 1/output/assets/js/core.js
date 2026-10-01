/**
 * core.js — Echelon Dashboard Template: Core Module
 *
 * Responsibilities
 * ────────────────
 *  • Init: render tabs + tab-content containers from DASHBOARD_CONFIG
 *  • Footer: inject current year
 *  • Header: populate title, subtitle, refresh date
 *  • Tab switching: show/hide tab panels, sync active state
 *  • Filter modal: delegated entirely to DashboardFilters (filters.js)
 *  • Detail modal: open/close
 *  • Info tooltip: show/hide on .info-icon hover
 *  • Page loader: hide after DOMContentLoaded + a short delay
 *
 * Depends on
 * ──────────
 *  utils.js   (DashboardUtils)
 *  filters.js (DashboardFilters)
 *
 * Usage
 * ─────
 *  DashboardCore.init(DASHBOARD_CONFIG);
 *
 * Downstream callers (charts.js) may later call:
 *  DashboardCore.getActiveFilters()        → { key: Array<value>, ... }
 *  DashboardCore.onFilterChange(fn)        → register callback
 *  DashboardCore.setFilterValues(key, v[]) → populate filter chips
 *  DashboardCore.openDetail(title, html)
 *  DashboardCore.hideLoader()
 */

(function (global) {
    'use strict';

    var _config = null;
    var _dom    = {};   // DOM refs populated by _cacheDOM()

    /* ─────────────────────────────────────────────────────────────────
       PUBLIC API
       ───────────────────────────────────────────────────────────────── */

    /**
     * Initialise the dashboard skeleton.
     * Must be called from DOMContentLoaded with the page DASHBOARD_CONFIG.
     */
    function init(config) {
        _config = config || {};

        _cacheDOM();
        _initDisplayPreferences();
        _renderHeader();
        _renderFooter();
        _renderTabs();
        _renderTabContent();

        // Delegate all filter logic to DashboardFilters
        if (global.DashboardFilters) {
            DashboardFilters.init(_config, _dom);
        }

        _bindGlobalEvents();
        _scheduleLoaderHide();
    }

    /** Delegate — returns { key: Array<string> } active-filter snapshot. */
    function getActiveFilters() {
        return global.DashboardFilters ? DashboardFilters.getActiveFilters() : {};
    }

    /** Delegate — register a callback invoked on every filter apply. */
    function onFilterChange(fn) {
        if (global.DashboardFilters) DashboardFilters.onFilterChange(fn);
    }

    /** Delegate — populate chip values for a given filter key. */
    function setFilterValues(key, values) {
        if (global.DashboardFilters) DashboardFilters.setFilterValues(key, values);
    }

    function onSelectionChange(fn) {
        if (global.DashboardFilters) DashboardFilters.onSelectionChange(fn);
    }

    function broadcastSelection(selection) {
        if (global.DashboardFilters) DashboardFilters.broadcastSelection(selection);
    }

    /** Open the detail/drilldown modal with arbitrary HTML content. */
    function openDetail(title, htmlContent) {
        if (!_dom.detailModal) return;
        var titleEl   = document.getElementById('detailModal-title');
        var contentEl = document.getElementById('detailModal-content');
        if (titleEl)   titleEl.textContent = title || 'Detail';
        // textContent on title (no XSS); htmlContent must be trusted markup
        if (contentEl) contentEl.innerHTML = htmlContent || '';
        _dom.detailModal.style.display = 'flex';
    }

    /** Manually hide the page loader (called by charts.js once data renders). */
    function hideLoader() {
        _hideLoader();
    }

    /* ─────────────────────────────────────────────────────────────────
       PRIVATE — DOM helpers
       ───────────────────────────────────────────────────────────────── */

    function _cacheDOM() {
        _dom.loader         = document.getElementById('page-loader');
        _dom.title          = document.getElementById('dashboard-title');
        _dom.subtitle       = document.getElementById('dashboard-subtitle');
        _dom.refreshDate    = document.getElementById('refresh-date');
        _dom.currentYear    = document.getElementById('current-year');
        _dom.tabsNav        = document.querySelector('.dashboard-tabs');
        _dom.mainContent    = document.getElementById('dashboard-content');
        _dom.filterModal    = document.getElementById('filterModal');
        _dom.filterSections = document.getElementById('filter-sections-container');
        _dom.filterBadge    = document.getElementById('filter-badge');
        _dom.filterBtn      = document.getElementById('filter-btn');
        _dom.filterApply    = document.getElementById('filter-apply-btn');
        _dom.filterReset    = document.getElementById('filter-reset-btn');
        _dom.filterClose    = document.getElementById('filter-close-btn');
        _dom.detailModal    = document.getElementById('detailModal');
        _dom.infoTooltip    = document.getElementById('info-tooltip');
        _dom.navStyleSelect = document.getElementById('nav-style-select');
        _dom.themeToggle    = document.getElementById('theme-toggle');
    }

    function _initDisplayPreferences() {
        var root = document.documentElement;
        var navStyle = _readPreference('echelon-nav-style') || 'signal-line';
        var theme = _readPreference('echelon-theme') || 'dark';
        var navStyleAvailable = _dom.navStyleSelect && Array.prototype.some.call(
            _dom.navStyleSelect.options,
            function (option) { return option.value === navStyle; }
        );
        if (!navStyleAvailable) {
            navStyle = 'signal-line';
            _writePreference('echelon-nav-style', navStyle);
        }
        root.dataset.navStyle = navStyle;
        root.dataset.theme = theme;
        if (_dom.navStyleSelect) _dom.navStyleSelect.value = navStyle;
        _syncThemeButton(theme);
    }

    function _readPreference(key) {
        try { return global.localStorage.getItem(key); } catch (err) { return null; }
    }

    function _writePreference(key, value) {
        try { global.localStorage.setItem(key, value); } catch (err) { /* storage may be blocked */ }
    }

    function _syncThemeButton(theme) {
        if (!_dom.themeToggle) return;
        var isDark = theme !== 'light';
        _dom.themeToggle.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
        _dom.themeToggle.querySelector('span').textContent = isDark ? '☼' : '☾';
    }

    /* ─────────────────────────────────────────────────────────────────
       PRIVATE — Header / Footer
       ───────────────────────────────────────────────────────────────── */

    function _renderHeader() {
        var c = _config;
        if (_dom.title    && c.title)    _dom.title.textContent    = c.title;
        if (_dom.subtitle && c.subtitle) _dom.subtitle.textContent = c.subtitle;
        if (c.title) document.title = c.title;

        if (_dom.refreshDate) {
            if (c.refreshDate) {
                _dom.refreshDate.textContent = global.DashboardUtils ? DashboardUtils.fmtDateTime(c.refreshDate) : c.refreshDate;
            } else {
                var p = _dom.refreshDate.closest('.header-refresh');
                if (p) p.style.display = 'none';
            }
        }
    }

    function _renderFooter() {
        if (_dom.currentYear) {
            _dom.currentYear.textContent = new Date().getFullYear();
        }
    }

    /* ─────────────────────────────────────────────────────────────────
       PRIVATE — Tabs
       ───────────────────────────────────────────────────────────────── */

    function _renderTabs() {
        var tabs = (_config.tabs || []);
        if (!_dom.tabsNav || !tabs.length) return;

        var displayControls = _dom.tabsNav.querySelector('.display-controls');

        tabs.forEach(function (tab, idx) {
            var btn = document.createElement('button');
            btn.className   = 'dashboard-tab' + (idx === 0 ? ' active' : '');
            btn.dataset.tab = tab.id;
            btn.setAttribute('type', 'button');
            btn.setAttribute('role', 'tab');
            btn.setAttribute('id', 'tab-btn-' + tab.id);
            btn.setAttribute('aria-selected', idx === 0 ? 'true' : 'false');
            btn.setAttribute('aria-controls', tab.id);

            var iconSpan = document.createElement('span');
            iconSpan.className   = 'tab-icon';
            iconSpan.setAttribute('aria-hidden', 'true');
            iconSpan.textContent = tab.icon || '';

            btn.appendChild(iconSpan);
            btn.appendChild(document.createTextNode(' ' + (tab.label || tab.id)));

            btn.addEventListener('click', function () {
                _switchTab(tab.id, btn);
            });

            btn.addEventListener('keydown', function (event) {
                _handleTabKeydown(event, btn);
            });

            _dom.tabsNav.insertBefore(btn, displayControls);
        });
    }

    function _renderTabContent() {
        var tabs = (_config.tabs || []);
        if (!_dom.mainContent || !tabs.length) return;

        tabs.forEach(function (tab, idx) {
            var panel = document.createElement('div');
            panel.id        = tab.id;
            panel.className = 'tab-content' + (idx === 0 ? ' active' : '');
            panel.setAttribute('role', 'tabpanel');
            panel.setAttribute('aria-labelledby', 'tab-btn-' + tab.id);
            panel.setAttribute('tabindex', '0');

            var grid = document.createElement('div');
            grid.className = 'charts-grid';
            grid.id        = tab.id + '-grid';

            panel.appendChild(grid);
            _dom.mainContent.appendChild(panel);
        });
    }

    function _switchTab(tabId, clickedBtn) {
        document.querySelectorAll('.dashboard-tab').forEach(function (t) {
            t.classList.remove('active');
            t.setAttribute('aria-selected', 'false');
        });
        document.querySelectorAll('.tab-content').forEach(function (p) {
            p.classList.remove('active');
        });

        if (clickedBtn) {
            clickedBtn.classList.add('active');
            clickedBtn.setAttribute('aria-selected', 'true');
        }
        var panel = document.getElementById(tabId);
        if (panel) panel.classList.add('active');
    }

    function _handleTabKeydown(event, currentTab) {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].indexOf(event.key) === -1) return;
        var tabs = Array.from(document.querySelectorAll('.dashboard-tab'));
        var index = tabs.indexOf(currentTab);
        event.preventDefault();
        if (event.key === 'Home') index = 0;
        else if (event.key === 'End') index = tabs.length - 1;
        else index = (index + ((event.key === 'ArrowRight' || event.key === 'ArrowDown') ? 1 : -1) + tabs.length) % tabs.length;
        _switchTab(tabs[index].dataset.tab, tabs[index]);
        tabs[index].focus();
    }

    /* ─────────────────────────────────────────────────────────────────
       PRIVATE — Info Tooltip
       ───────────────────────────────────────────────────────────────── */

    function _bindTooltips() {
        var tip = _dom.infoTooltip;
        if (!tip) return;

        document.addEventListener('mouseover', function (e) {
            var icon = e.target.closest('.info-icon');
            if (!icon) return;
            var text = icon.dataset.info || icon.title || '';
            if (!text) return;
            tip.textContent = text;
            tip.style.display = 'block';
            tip.setAttribute('aria-hidden', 'false');
            _positionTooltip(e, tip);
        });

        document.addEventListener('mousemove', function (e) {
            if (tip.style.display === 'block') _positionTooltip(e, tip);
        });

        document.addEventListener('mouseout', function (e) {
            if (e.target.closest('.info-icon')) {
                tip.style.display = 'none';
                tip.setAttribute('aria-hidden', 'true');
            }
        });

        document.addEventListener('focusin', function (e) {
            var icon = e.target.closest('.info-icon');
            if (!icon) return;
            tip.textContent = icon.dataset.info || '';
            tip.style.display = 'block';
            tip.setAttribute('aria-hidden', 'false');
            var rect = icon.getBoundingClientRect();
            _positionTooltip({ clientX: rect.left, clientY: rect.bottom }, tip);
        });

        document.addEventListener('focusout', function (e) {
            if (e.target.closest('.info-icon')) {
                tip.style.display = 'none';
                tip.setAttribute('aria-hidden', 'true');
            }
        });
    }

    function _positionTooltip(e, tip) {
        var offset = 14;
        var x = e.clientX + offset;
        var y = e.clientY + offset;
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        if (x + 440 > vw) x = e.clientX - 440 - offset;
        if (y + tip.offsetHeight > vh) y = e.clientY - tip.offsetHeight - offset;
        tip.style.left = Math.max(0, x) + 'px';
        tip.style.top  = Math.max(0, y) + 'px';
    }

    /* ─────────────────────────────────────────────────────────────────
       PRIVATE — Event bindings
       ───────────────────────────────────────────────────────────────── */

    function _bindGlobalEvents() {
        if (_dom.navStyleSelect) {
            _dom.navStyleSelect.addEventListener('change', function () {
                document.documentElement.dataset.navStyle = this.value;
                _writePreference('echelon-nav-style', this.value);
                _syncFilterBtnPosition();
            });
        }
        if (_dom.themeToggle) {
            _dom.themeToggle.addEventListener('click', function () {
                var next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
                document.documentElement.dataset.theme = next;
                _writePreference('echelon-theme', next);
                _syncThemeButton(next);
                global.dispatchEvent(new CustomEvent('dashboardthemechange', { detail: { theme: next } }));
            });
        }

        // Detail modal close button
        var detailClose = document.getElementById('detailModal-close');
        if (detailClose) {
            detailClose.addEventListener('click', function () {
                if (_dom.detailModal) _dom.detailModal.style.display = 'none';
            });
        }
        // Close detail modal on backdrop click
        if (_dom.detailModal) {
            _dom.detailModal.addEventListener('click', function (e) {
                if (e.target === _dom.detailModal) _dom.detailModal.style.display = 'none';
            });
        }

        // Escape key closes any open modal
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                if (global.DashboardFilters) DashboardFilters.closeModal();
                if (_dom.detailModal) _dom.detailModal.style.display = 'none';
            }
        });

        // Info tooltips
        _bindTooltips();
    }

    /* ─────────────────────────────────────────────────────────────────
       PRIVATE — Page Loader
       ───────────────────────────────────────────────────────────────── */

    function _scheduleLoaderHide() {
        // Hide after at most 3 s, or sooner if charts.js calls hideLoader()
        window.setTimeout(_hideLoader, 3000);
    }

    function _hideLoader() {
        var el = _dom.loader || document.getElementById('page-loader');
        if (!el) return;
        el.classList.add('hidden');
        window.setTimeout(function () {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, 450);
    }

    /* ─────────────────────────────────────────────────────────────────
       EXPORT
       ───────────────────────────────────────────────────────────────── */

    global.DashboardCore = {
        init:             init,
        getActiveFilters: getActiveFilters,   // delegates to DashboardFilters
        onFilterChange:   onFilterChange,     // delegates to DashboardFilters
        setFilterValues:  setFilterValues,    // delegates to DashboardFilters
        onSelectionChange: onSelectionChange,
        broadcastSelection: broadcastSelection,
        openDetail:       openDetail,
        hideLoader:       hideLoader,
    };

}(window));
