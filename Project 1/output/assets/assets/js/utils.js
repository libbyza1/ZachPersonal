/**
 * utils.js — Echelon Dashboard Template: Shared Utility Functions
 *
 * Pure helpers with no DOM, state, or visualization-engine dependencies.
 * Safe to load first; depended on by filters.js, core.js, and charts.js.
 *
 * Exposed on window.DashboardUtils:
 *   escHtml(str)                     — XSS-safe HTML entity encoder
 *   mergeDeep(target, source)        — recursive non-destructive object merge
 *   hexToRgba(hex, alpha)            — '#rrggbb' → 'rgba(r,g,b,a)'
 *   base64ToUint8Array(b64)          — standard base64 → Uint8Array
 *   fmtNum(n, decimals?)             — locale-formatted number with thousands separator
 *   fmtPct(n, decimals?)             — number formatted as percentage string
 *   fmtDateTime(value)               — refresh timestamp as MMM-DD-YYYY HH:MI:SS
 */

(function (global) {
    'use strict';

    /**
     * Escape HTML entities to prevent XSS when inserting untrusted strings
     * into innerHTML.  Always prefer textContent for pure-text nodes.
     * @param {*} str
     * @returns {string}
     */
    function escHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g,  '&amp;')
            .replace(/</g,  '&lt;')
            .replace(/>/g,  '&gt;')
            .replace(/"/g,  '&quot;')
            .replace(/'/g,  '&#39;');
    }

    /**
     * Recursive non-destructive deep merge (right into left).
     * Arrays in source overwrite arrays in target (no concat).
     * @param {object} target
     * @param {object} source
     * @returns {object}
     */
    function mergeDeep(target, source) {
        var out = Object.assign({}, target);
        if (_isObj(target) && _isObj(source)) {
            Object.keys(source).forEach(function (k) {
                if (k === '__proto__' || k === 'prototype' || k === 'constructor') return;
                if (_isObj(source[k])) {
                    out[k] = mergeDeep(target[k] || {}, source[k]);
                } else {
                    out[k] = source[k];
                }
            });
        }
        return out;
    }

    function _isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

    /**
     * Convert a 6-digit hex colour to an rgba() CSS string.
     * @param {string} hex    — e.g. '#005eb8'
     * @param {number} alpha  — 0–1 (default: 1)
     * @returns {string}
     */
    function hexToRgba(hex, alpha) {
        var r = parseInt(hex.slice(1, 3), 16);
        var g = parseInt(hex.slice(3, 5), 16);
        var b = parseInt(hex.slice(5, 7), 16);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + (alpha != null ? alpha : 1) + ')';
    }

    /**
     * Decode a standard base64 string to a Uint8Array.
     * Used by charts.js for pako-compressed embedded datasets.
     * @param {string} b64
     * @returns {Uint8Array}
     */
    function base64ToUint8Array(b64) {
        var raw   = atob(b64.replace(/\s/g, ''));
        var bytes = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        return bytes;
    }

    /**
     * Format a number with thousands separator.
     * Returns '—' for null/undefined/NaN.
     * @param {number} n
     * @param {number} [decimals=0]
     * @returns {string}
     */
    function fmtNum(n, decimals) {
        if (n == null || isNaN(n)) return '\u2014';
        return Number(n).toLocaleString(undefined, {
            minimumFractionDigits: decimals || 0,
            maximumFractionDigits: decimals || 0,
        });
    }

    /**
     * Format a number as a percentage string.
     * Returns '—' for null/undefined/NaN.
     * @param {number} n
     * @param {number} [decimals=1]
     * @returns {string}
     */
    function fmtPct(n, decimals) {
        if (n == null || isNaN(n)) return '\u2014';
        return Number(n).toFixed(decimals !== undefined ? decimals : 1) + '%';
    }

    function fmtDate(value) {
        if (value == null || value === '') return '\u2014';
        var isoDate = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        var date = isoDate
            ? new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]))
            : (value instanceof Date ? value : new Date(value));
        if (isNaN(date.getTime())) return '\u2014';
        return new Intl.DateTimeFormat('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
        }).format(date);
    }

    function fmtDateTime(value) {
        if (value == null || value === '') return '\u2014';
        var isoDate = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        var date = isoDate
            ? new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]))
            : (value instanceof Date ? value : new Date(value));
        if (isNaN(date.getTime())) return '\u2014';
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        function pad(valuePart) { return String(valuePart).padStart(2, '0'); }
        return months[date.getMonth()] + '-' + pad(date.getDate()) + '-' + date.getFullYear() + ' ' +
            pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
    }

    function classifyValue(value, thresholds) {
        thresholds = thresholds || {};
        var number = Number(value);
        if (!isFinite(number)) return 'neutral';
        var direction = thresholds.direction || 'high-is-bad';
        if (direction === 'low-is-bad') {
            if (thresholds.critical != null && number <= thresholds.critical) return 'critical';
            if (thresholds.warn != null && number <= thresholds.warn) return 'warn';
        } else {
            if (thresholds.critical != null && number >= thresholds.critical) return 'critical';
            if (thresholds.warn != null && number >= thresholds.warn) return 'warn';
        }
        return 'good';
    }

    function computePeriodDelta(series, period) {
        var offsets = { wow: 1, mom: 1, qoq: 1, yoy: 12 };
        var offset = typeof period === 'number' ? period : (offsets[String(period || 'mom').toLowerCase()] || 1);
        var values = (series || []).map(function (item) {
            return Number(item && typeof item === 'object' ? item.value : item);
        }).filter(isFinite);
        if (values.length <= offset) return { current: null, previous: null, delta: null, pct: null, direction: 'flat' };
        var current = values[values.length - 1];
        var previous = values[values.length - 1 - offset];
        var delta = current - previous;
        return {
            current: current,
            previous: previous,
            delta: delta,
            pct: previous === 0 ? null : (delta / Math.abs(previous)) * 100,
            direction: delta > 0 ? 'up' : (delta < 0 ? 'down' : 'flat'),
        };
    }

    function calcField(row, expression) {
        expression = expression || {};
        var operation = expression.op;
        var fields = expression.fields || [];
        var values = fields.map(function (field) { return Number(row[field]) || 0; });
        if (operation === 'sum') return values.reduce(function (total, value) { return total + value; }, 0);
        if (operation === 'diff') return (values[0] || 0) - (values[1] || 0);
        if (operation === 'ratio') return values[1] ? values[0] / values[1] : null;
        if (operation === 'pct') return values[1] ? ((values[0] - values[1]) / Math.abs(values[1])) * 100 : null;
        if (operation === 'product') return values.reduce(function (total, value) { return total * value; }, 1);
        if (operation === 'coalesce') {
            for (var i = 0; i < fields.length; i++) if (row[fields[i]] != null) return row[fields[i]];
            return expression.fallback != null ? expression.fallback : null;
        }
        throw new Error('Unsupported calculated field operation: ' + operation);
    }

    var METRIC_COLORS = Object.freeze({
        primary: '#56b4e9', secondary: '#e69f00', success: '#009e73',
        warning: '#f0e442', danger: '#d55e00', comparison: '#cc79a7', neutral: '#b8c2cc',
    });

    var METRIC_DEFINITIONS = Object.create(null);

    /* ── Export ──────────────────────────────────────────────────────── */

    global.DashboardUtils = {
        escHtml:            escHtml,
        mergeDeep:          mergeDeep,
        hexToRgba:          hexToRgba,
        base64ToUint8Array: base64ToUint8Array,
        fmtNum:             fmtNum,
        fmtPct:             fmtPct,
        fmtDate:            fmtDate,
        fmtDateTime:        fmtDateTime,
        classifyValue:      classifyValue,
        computePeriodDelta: computePeriodDelta,
        calcField:          calcField,
        METRIC_COLORS:      METRIC_COLORS,
        METRIC_DEFINITIONS: METRIC_DEFINITIONS,
    };

}(window));
