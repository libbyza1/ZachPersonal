/**
 * filters.js — Echelon Dashboard Template: Filter Module
 *
 * Manages all filter state, modal rendering, chip selection, badge
 * count, and filter-change event dispatch.
 *
 * Depends on:
 *   utils.js → DashboardUtils.escHtml
 *
 * Initialised by DashboardCore.init() via:
 *   DashboardFilters.init(config, dom)
 *
 * Public API:
 *   DashboardFilters.init(config, dom)       — set up modal + bind events
 *   DashboardFilters.getActiveFilters()      — { key: Array<string> }
 *   DashboardFilters.onFilterChange(fn)      — register callback(activeFilters)
 *   DashboardFilters.setFilterValues(k, v[]) — populate chip options for key k
 *   DashboardFilters.openModal()             — programmatically open filter modal
 *   DashboardFilters.closeModal()            — programmatically close filter modal
 */

(function (global) {
    'use strict';

    var _config          = null;
    var _dom             = {};
    var _activeFilters   = {};   // { key: Set<string> }
    var _filterCallbacks = [];
    var _selectionCallbacks = [];
    var _previousFocus   = null;

    /* ── Public API ──────────────────────────────────────────────────── */

    /**
     * Initialise the filter module.
     * Must be called after DashboardCore has populated _dom via _cacheDOM().
     *
     * @param {object} config — DASHBOARD_CONFIG
     * @param {object} dom    — shared DOM reference object from DashboardCore
     */
    function init(config, dom) {
        _config = config || {};
        _dom    = dom    || {};
        _renderFilterModal();
        _bindFilterEvents();
    }

    /** Return a plain-object snapshot: { key: Array<string> }. */
    function getActiveFilters() {
        var out = {};
        Object.keys(_activeFilters).forEach(function (k) {
            out[k] = Array.from(_activeFilters[k]);
        });
        return out;
    }

    /**
     * Register a callback invoked whenever filters are applied.
     * @param {function} fn — called with ({ key: Array<string> })
     */
    function onFilterChange(fn) {
        if (typeof fn === 'function') _filterCallbacks.push(fn);
    }

    function onSelectionChange(fn) {
        if (typeof fn === 'function') _selectionCallbacks.push(fn);
    }

    function broadcastSelection(selection) {
        var detail = Object.assign({}, selection || {});
        _selectionCallbacks.forEach(function (fn) {
            try { fn(detail); } catch (err) { console.error('Selection callback error:', err); }
        });
        global.dispatchEvent(new CustomEvent('dashboardselectionchange', { detail: detail }));
    }

    /**
     * Populate chip options for a given filter key.
     * Called by charts.js after data is loaded.
     * Default selection = all values selected.
     *
     * @param {string}   key
     * @param {string[]} values
     */
    function setFilterValues(key, values) {
        var container = document.getElementById('filter-chips-' + key);
        if (!container) return;

        // Initialise selection to all selected on first call
        if (!_activeFilters[key]) {
            _activeFilters[key] = new Set(values);
        }

        var definition = (_config.filters || []).find(function (filter) { return filter.key === key; }) || {};
        values = _sortValues(values || [], definition.sortOrder);
        container.innerHTML = '';
        (values || []).forEach(function (val) {
            var chip = document.createElement('span');
            chip.className    = 'filter-chip' + (_activeFilters[key].has(val) ? ' selected' : '');
            chip.textContent  = val;
            chip.dataset.key  = key;
            chip.dataset.val  = val;
            chip.setAttribute('role', 'checkbox');
            chip.setAttribute('aria-checked', _activeFilters[key].has(val) ? 'true' : 'false');
            chip.setAttribute('tabindex', '0');
            chip.addEventListener('click', _toggleChip);
            chip.addEventListener('keydown', function (e) {
                if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); _toggleChip.call(chip); }
            });
            container.appendChild(chip);
        });
    }

    function _sortValues(values, sortOrder) {
        var copy = values.slice();
        if (Array.isArray(sortOrder)) {
            return copy.sort(function (left, right) {
                var leftIndex = sortOrder.indexOf(left);
                var rightIndex = sortOrder.indexOf(right);
                return (leftIndex < 0 ? sortOrder.length : leftIndex) - (rightIndex < 0 ? sortOrder.length : rightIndex);
            });
        }
        if (sortOrder === 'desc') return copy.sort(function (left, right) { return String(right).localeCompare(String(left), undefined, { numeric: true }); });
        if (sortOrder === 'asc') return copy.sort(function (left, right) { return String(left).localeCompare(String(right), undefined, { numeric: true }); });
        return copy;
    }

    /** Open the filter modal. */
    function openModal() {
        if (_dom.filterModal) {
            _previousFocus = document.activeElement;
            _dom.filterModal.removeAttribute('style');
            _dom.filterModal.style.display = 'flex';
            if (_dom.filterBtn) _dom.filterBtn.setAttribute('aria-expanded', 'true');
            // Move focus into the modal for accessibility
            var firstBtn = _dom.filterModal.querySelector('button, [tabindex="0"]');
            if (firstBtn) firstBtn.focus();
        }
    }

    /** Close the filter modal. */
    function closeModal() {
        if (_dom.filterModal) _dom.filterModal.style.display = 'none';
        if (_dom.filterBtn) _dom.filterBtn.setAttribute('aria-expanded', 'false');
        if (_previousFocus && typeof _previousFocus.focus === 'function') _previousFocus.focus();
        _previousFocus = null;
    }

    /* ── Private ─────────────────────────────────────────────────────── */

    function _renderFilterModal() {
        var filters = (_config.filters || []);
        if (!_dom.filterSections) return;

        if (_dom.filterBtn) _dom.filterBtn.hidden = filters.length === 0;

        _dom.filterSections.innerHTML = '';

        filters.forEach(function (f) {
            var sec = document.createElement('div');
            sec.className = 'filter-section';

            sec.innerHTML =
                '<div class="filter-section-label">' +
                    '<span>' + _escHtml(f.label || f.key) + '</span>' +
                    '<div class="filter-section-actions">' +
                        '<span class="filter-section-link" role="button" tabindex="0" ' +
                              'data-action="select-all" data-key="' + _escHtml(f.key) + '">' +
                              'Select All</span>' +
                        '<span class="filter-section-divider" aria-hidden="true">|</span>' +
                        '<span class="filter-section-link" role="button" tabindex="0" ' +
                              'data-action="unselect-all" data-key="' + _escHtml(f.key) + '">' +
                              'Unselect All</span>' +
                    '</div>' +
                '</div>' +
                '<div class="filter-chips" ' +
                     'role="group" aria-label="' + _escHtml(f.label || f.key) + ' filter options" ' +
                     'id="filter-chips-' + _escHtml(f.key) + '"></div>';

            sec.addEventListener('click', _handleSectionActions);
            sec.addEventListener('keydown', function (e) {
                if (e.key === ' ' || e.key === 'Enter') _handleSectionActions(e);
            });
            _dom.filterSections.appendChild(sec);
        });
    }

    function _handleSectionActions(e) {
        var action = e.target.dataset.action;
        var key    = e.target.dataset.key;
        if (!action || !key) return;
        var chips = e.currentTarget.querySelectorAll('.filter-chip');
        chips.forEach(function (c) {
            var selected = action === 'select-all';
            c.classList.toggle('selected', selected);
            c.setAttribute('aria-checked', selected ? 'true' : 'false');
        });
    }

    function _toggleChip() {
        var selected = this.classList.toggle('selected');
        this.setAttribute('aria-checked', selected ? 'true' : 'false');
    }

    function _bindFilterEvents() {
        if (_dom.filterBtn) {
            _dom.filterBtn.addEventListener('click', openModal);
        }
        if (_dom.filterApply) {
            _dom.filterApply.addEventListener('click', _applyFilters);
        }
        if (_dom.filterReset) {
            _dom.filterReset.addEventListener('click', _resetFilters);
        }
        if (_dom.filterClose) {
            _dom.filterClose.addEventListener('click', closeModal);
        }
        // Close on backdrop click
        if (_dom.filterModal) {
            _dom.filterModal.addEventListener('click', function (e) {
                if (e.target === _dom.filterModal) closeModal();
            });
        }
    }

    function _applyFilters() {
        (_config.filters || []).forEach(function (f) {
            var chips = document.querySelectorAll('#filter-chips-' + f.key + ' .filter-chip');
            _activeFilters[f.key] = new Set();
            chips.forEach(function (c) {
                if (c.classList.contains('selected')) {
                    _activeFilters[f.key].add(c.dataset.val);
                }
            });
        });
        _updateFilterBadge();
        closeModal();
        _fireFilterChange();
    }

    function _resetFilters() {
        (_config.filters || []).forEach(function (f) {
            var chips = document.querySelectorAll('#filter-chips-' + f.key + ' .filter-chip');
            chips.forEach(function (c) {
                c.classList.add('selected');
                c.setAttribute('aria-checked', 'true');
            });
            _activeFilters[f.key] = new Set(
                Array.from(chips).map(function (c) { return c.dataset.val; }));
        });
        _updateFilterBadge();
        _fireFilterChange();
    }

    function _updateFilterBadge() {
        if (!_dom.filterBadge) return;
        var total = 0;
        (_config.filters || []).forEach(function (f) {
            var all = document.querySelectorAll('#filter-chips-' + f.key + ' .filter-chip');
            var sel = document.querySelectorAll('#filter-chips-' + f.key + ' .filter-chip.selected');
            if (sel.length < all.length) total++;
        });
        _dom.filterBadge.textContent = total > 0 ? total : '';
    }

    function _fireFilterChange() {
        var snapshot = getActiveFilters();
        _filterCallbacks.forEach(function (fn) {
            try { fn(snapshot); } catch (err) { console.error('Filter callback error:', err); }
        });
    }

    /** Use DashboardUtils.escHtml when available; inline fallback if not yet loaded. */
    function _escHtml(str) {
        if (global.DashboardUtils) return DashboardUtils.escHtml(str);
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /* ── Export ──────────────────────────────────────────────────────── */

    global.DashboardFilters = {
        init:             init,
        getActiveFilters: getActiveFilters,
        onFilterChange:   onFilterChange,
        setFilterValues:  setFilterValues,
        onSelectionChange: onSelectionChange,
        broadcastSelection: broadcastSelection,
        openModal:        openModal,
        closeModal:       closeModal,
    };

}(window));
