/**
 * dashboard-charts.js — Echelon Dashboard Template: Chart Module
 *
 * Responsibilities
 * ────────────────
 *  • Configure ApexCharts defaults and D3 rendering helpers
 *  • Expose shared colour palettes and chart helpers
 *  • Provide a factory for the most common chart types
 *  • Expose DashboardCharts.init(config) — override with your own logic
 *    to build tabs 1–N and inject chart cards into their grids
 *
 * Depends on
 * ──────────
 *  • utils.js    (DashboardUtils)  — must load first
 *  • ApexCharts 3.x (global ApexCharts)
 *  • D3 7.x (global d3)
 *  • core.js    (DashboardCore) — must load first
 *
 * Usage
 * ─────
 *  // 1. Call DashboardCharts.init(DASHBOARD_CONFIG) after
 *  //    DashboardCore.init() in your page script.
 *
 *  // 2. Override DashboardCharts._buildTabs to wire up your specific charts:
 *  //
 *  //    DashboardCharts._buildTabs = function(config) {
 *  //        var grid = document.getElementById('tab1-grid');
 *  //        var card = DashboardCharts.createCard('Monthly Cases', 'full-width');
 *  //        grid.appendChild(card.el);
 *  //        DashboardCharts.createBarChart(card.canvasId, labels, values);
 *  //    };
 */

/* ═══════════════════════════════════════════════════════════════════
   IIFE
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
    'use strict';

    /* ─────────────────────────────────────────────────────────────────
       COLOUR PALETTES
       ───────────────────────────────────────────────────────────────── */

    /** 12-colour categorical palette (accessible, print-friendly). */
    var PALETTE_CATEGORICAL = [
        '#005eb8', '#00aeef', '#764ba2', '#2E7D32',
        '#F57F17', '#C62828', '#0277BD', '#558B2F',
        '#6A1B9A', '#EF6C00', '#00695C', '#37474F',
    ];

    /** Sequential blue (light → dark) for heatmaps / single series. */
    var PALETTE_BLUE = [
        '#E3F2FD', '#BBDEFB', '#90CAF9', '#64B5F6',
        '#42A5F5', '#2196F3', '#1E88E5', '#1565C0',
        '#0D47A1', '#003a75',
    ];

    /** Diverging red–blue for performance deviation charts. */
    var PALETTE_DIVERGE = [
        '#C62828', '#EF5350', '#EF9A9A', '#FFCDD2',
        '#E8EAF6', '#BBDEFB', '#64B5F6', '#1E88E5', '#0D47A1',
    ];

    /** Status traffic-light colours. */
    var PALETTE_STATUS = {
        success: '#2E7D32',
        warning: '#F57F17',
        danger:  '#C62828',
        info:    '#1565C0',
        neutral: '#6b7a8d',
    };

    /* ─────────────────────────────────────────────────────────────────
    VISUALIZATION ENGINE DEFAULTS
       ───────────────────────────────────────────────────────────────── */

    function _registerDefaults() {
        if (!global.Apex) global.Apex = {};
        global.Apex.chart = { fontFamily: "'Open Sans', 'Segoe UI', Tahoma, sans-serif", toolbar: { show: true } };
        global.Apex.legend = { position: 'bottom' };
    }

    /* ─────────────────────────────────────────────────────────────────
       CARD HELPERS
       ───────────────────────────────────────────────────────────────── */

    var _cardCounter = 0;
    var _chartInstances = [];

    /**
     * Create a .chart-card element ready to be appended to a grid.
     *
     * @param {string}  title      — card heading text
     * @param {string}  [spanClass] — 'full-width' | 'half-width' | 'one-third' (default)
     * @param {string}  [infoText]  — tooltip text for the ℹ️ icon (optional)
     * @returns {{ el: HTMLElement, canvasId: string, gridEl: HTMLElement }}
     */
    function createCard(title, spanClass, infoText) {
        _cardCounter++;
        var canvasId = 'chart-canvas-' + _cardCounter;

        var card = document.createElement('div');
        card.className = 'chart-card' + (spanClass ? ' ' + spanClass : '');

        // Title bar
        var titleBar = document.createElement('div');
        titleBar.className = 'chart-title';

        var titleSpan = document.createElement('span');
        titleSpan.textContent = title || 'Chart';

        titleBar.appendChild(titleSpan);

        if (infoText) {
            var icon = document.createElement('button');
            icon.type = 'button';
            icon.className   = 'info-icon';
            icon.dataset.info = infoText;
            icon.setAttribute('aria-label', 'About ' + (title || 'this chart'));
            icon.setAttribute('aria-describedby', 'info-tooltip');
            titleBar.appendChild(icon);
        }

        // Canvas wrapper
        var wrapper = document.createElement('div');
        wrapper.className = 'chart-canvas-wrapper';

        var chartHost = document.createElement('div');
        chartHost.id = canvasId;
        chartHost.className = 'chart-host';

        wrapper.appendChild(chartHost);
        card.appendChild(titleBar);
        card.appendChild(wrapper);

        return { el: card, canvasId: canvasId, canvasWrapper: wrapper };
    }

    /**
     * Create a KPI metric card (no canvas, just a stat display).
     *
     * @param {string} title
     * @param {{ label: string, value: string|number, colorClass: string }[]} kpis
     * @param {string} [spanClass]
     */
    function createKpiCard(title, kpis, spanClass, infoText) {
        var escHtml = DashboardUtils.escHtml;
        var card = document.createElement('div');
        card.className = 'chart-card' + (spanClass ? ' ' + spanClass : '');

        var titleBar = document.createElement('div');
        titleBar.className = 'chart-title';
        titleBar.innerHTML = '<span>' + escHtml(title) + '</span>';

        if (infoText) {
            var icon = document.createElement('button');
            icon.type = 'button';
            icon.className = 'info-icon';
            icon.dataset.info = infoText;
            icon.setAttribute('aria-label', 'About ' + (title || 'this KPI'));
            icon.setAttribute('aria-describedby', 'info-tooltip');
            titleBar.appendChild(icon);
        }

        var grid = document.createElement('div');
        grid.className = 'kpi-grid';

        (kpis || []).forEach(function (kpi) {
            var tile = document.createElement('div');
            var classification = DashboardUtils.classifyValue(kpi.value, kpi.thresholds);
            tile.className = 'kpi-card status-' + classification;
            tile.innerHTML =
                '<div class="kpi-value">' + escHtml(kpi.value == null || kpi.value === '' ? '—' : String(kpi.value)) + '</div>' +
                '<div class="kpi-label">'  + escHtml(kpi.label || '') + '</div>' +
                (kpi.target != null ? '<div class="kpi-meta"><span>Target</span><strong>' + escHtml(String(kpi.target)) + '</strong></div>' : '') +
                (kpi.variance != null ? '<div class="kpi-meta"><span>Variance</span><strong>' + escHtml(String(kpi.variance)) + '</strong></div>' : '') +
                (kpi.trend != null ? '<div class="kpi-trend" aria-label="Trend">' + escHtml(String(kpi.trend)) + '</div>' : '');
            if (kpi.colorClass) tile.style.borderLeftColor = _statusColor(kpi.colorClass);
            grid.appendChild(tile);
        });

        card.appendChild(titleBar);
        card.appendChild(grid);
        return { el: card };
    }

    /** Add an insight panel (Observations / Assumptions / Recommendations) to a card. */
    function addInsightPanel(cardEl, observations, assumptions, recommendations) {
        var escHtml = DashboardUtils.escHtml;
        var panel = document.createElement('div');
        panel.className = 'chart-insights';
        panel.innerHTML =
            '<div class="insight-col insight-obs">'  +
                '<div class="insight-label">Observations</div>'   +
                '<div class="insight-text">' + escHtml(observations || '') + '</div>' +
            '</div>' +
            '<div class="insight-col insight-expl">' +
                '<div class="insight-label">Assumptions</div>'     +
                '<div class="insight-text">' + escHtml(assumptions || '') + '</div>' +
            '</div>' +
            '<div class="insight-col insight-reco">' +
                '<div class="insight-label">Recommendations</div>' +
                '<div class="insight-text">' + escHtml(recommendations || '') + '</div>' +
            '</div>';
        cardEl.appendChild(panel);
        return panel;
    }

    /* ─────────────────────────────────────────────────────────────────
       CHART FACTORY FUNCTIONS
       ────────────────────────────────────────────────────────────────
    All functions return their visualization engine instance.
       ───────────────────────────────────────────────────────────────── */

    /**
     * Bar chart (vertical by default).
     *
     * @param {string}   canvasId
     * @param {string[]} labels
     * @param {number[]} values
    * @param {object}   [opts]  — merged into the ApexCharts config
     */
    function createBarChart(canvasId, labels, values, opts) {
        opts = opts || {};
        return _renderApex(canvasId, DashboardUtils.mergeDeep(_apexBase(opts), {
            chart: { type: 'bar' },
            series: [{ name: opts.label || 'Value', data: values }],
            xaxis: { categories: labels },
            colors: opts.colors || _autoColors(Math.max(values.length, 1)),
            plotOptions: { bar: { horizontal: !!opts.horizontal, borderRadius: 3, distributed: opts.distributed !== false } },
            legend: { show: opts.showLegend === true },
        }), opts.chartOptions);
    }

    /**
     * Multi-series line chart.
     *
     * @param {string}   canvasId
     * @param {string[]} labels
     * @param {{ label, data, color }[]} series
     * @param {object}   [opts]
     */
    function createLineChart(canvasId, labels, series, opts) {
        opts = opts || {};
        return _renderApex(canvasId, DashboardUtils.mergeDeep(_apexBase(opts), {
            chart: { type: opts.fill ? 'area' : 'line' },
            series: series.map(function (item, index) {
                return { name: item.label || ('Series ' + (index + 1)), data: item.data };
            }),
            colors: series.map(function (item, index) { return item.color || PALETTE_CATEGORICAL[index % PALETTE_CATEGORICAL.length]; }),
            xaxis: { categories: labels },
            stroke: { curve: opts.tension === 0 ? 'straight' : 'smooth', width: 3 },
            fill: { opacity: opts.fill ? 0.22 : 1 },
            legend: { show: series.length > 1 },
        }), opts.chartOptions);
    }

    /**
     * Doughnut / Pie chart.
     *
     * @param {string}   canvasId
     * @param {string[]} labels
     * @param {number[]} values
     * @param {object}   [opts]  — opts.type: 'doughnut' (default) | 'pie'
     */
    function createDonutChart(canvasId, labels, values, opts) {
        opts = opts || {};
        return _renderApex(canvasId, DashboardUtils.mergeDeep(_apexBase(opts), {
            chart: { type: opts.type === 'pie' ? 'pie' : 'donut' },
            series: values,
            labels: labels,
            colors: opts.colors || _autoColors(values.length),
            legend: { show: true, position: 'right' },
            dataLabels: { enabled: true, formatter: function (value) { return value.toFixed(1) + '%'; } },
        }), opts.chartOptions);
    }

    /**
     * Scatter plot.
     *
     * @param {string}  canvasId
     * @param {{ x, y, label? }[]} points
     * @param {object}  [opts]
     */
    function createScatterChart(canvasId, points, opts) {
        opts = opts || {};
        return _renderApex(canvasId, DashboardUtils.mergeDeep(_apexBase(opts), {
            chart: { type: 'scatter' },
            series: [{ name: opts.label || 'Data', data: points.map(function (point) { return [point.x, point.y]; }) }],
            colors: [opts.color || PALETTE_CATEGORICAL[0]],
            xaxis: { title: { text: opts.xLabel || '' } },
            yaxis: { title: { text: opts.yLabel || '' } },
            legend: { show: false },
        }), opts.chartOptions);
    }

    /**
     * Stacked bar chart (convenience wrapper).
     *
     * @param {string}   canvasId
     * @param {string[]} labels
     * @param {{ label, data, color }[]} series
     * @param {object}   [opts]
     */
    function createStackedBarChart(canvasId, labels, series, opts) {
        opts = opts || {};
        return _renderApex(canvasId, DashboardUtils.mergeDeep(_apexBase(opts), {
            chart: { type: 'bar', stacked: true },
            series: series.map(function (item, index) { return { name: item.label || ('Series ' + (index + 1)), data: item.data }; }),
            colors: series.map(function (item, index) { return item.color || PALETTE_CATEGORICAL[index % PALETTE_CATEGORICAL.length]; }),
            xaxis: { categories: labels },
            legend: { show: true },
            plotOptions: { bar: { horizontal: !!opts.horizontal, borderRadius: 2 } },
        }), opts.chartOptions);
    }

    function _renderApex(containerId, defaults, overrides) {
        if (!global.ApexCharts) throw new Error('ApexCharts is not loaded');
        var host = document.getElementById(containerId);
        if (!host) throw new Error('Chart container not found: ' + containerId);
        host.innerHTML = '';
        var chart = new ApexCharts(host, DashboardUtils.mergeDeep(defaults, overrides || {}));
        chart.render();
        _chartInstances.push(chart);
        return chart;
    }

    function _apexBase(opts) {
        var styles = global.getComputedStyle(document.documentElement);
        var text = styles.getPropertyValue('--chart-label').trim() || '#c8d3de';
        var grid = styles.getPropertyValue('--chart-gridline').trim() || 'rgba(166,181,196,0.16)';
        var events = Object.assign({
            dataPointSelection: function (event, chartContext, selection) {
                var detail = {
                    source: opts.selectionSource || chartContext.el.id,
                    seriesIndex: selection.seriesIndex,
                    dataPointIndex: selection.dataPointIndex,
                    value: selection.w.config.series[selection.seriesIndex] && selection.w.config.series[selection.seriesIndex].data[selection.dataPointIndex],
                };
                if (global.DashboardCore) DashboardCore.broadcastSelection(detail);
                if (typeof opts.onSelect === 'function') opts.onSelect(detail, event);
            },
        }, opts.events || {});
        return {
            chart: {
                height: opts.height || 300,
                background: 'transparent',
                foreColor: text,
                animations: { enabled: true, speed: 420 },
                events: events,
            },
            theme: { mode: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark' },
            grid: { borderColor: grid },
            dataLabels: { enabled: opts.dataLabels !== false },
            noData: { text: 'No data available' },
            tooltip: { shared: true, intersect: false, theme: false, custom: _richTooltip },
        };
    }

    function _richTooltip(context) {
        var escHtml = DashboardUtils.escHtml;
        var config = context.w.config;
        var labels = config.xaxis && config.xaxis.categories;
        var heading = labels && labels[context.dataPointIndex] != null ? labels[context.dataPointIndex] : (config.labels && config.labels[context.dataPointIndex]);
        var entries = [];
        if (Array.isArray(config.series) && typeof config.series[0] === 'object') {
            config.series.forEach(function (series, index) {
                var raw = series.data && series.data[context.dataPointIndex];
                var value = raw && typeof raw === 'object' ? (raw.y != null ? raw.y : raw.value) : raw;
                entries.push({ name: series.name || ('Series ' + (index + 1)), value: Number(value), trend: _sparklineGlyph(series.data) });
            });
        } else {
            entries.push({ name: config.labels && config.labels[context.seriesIndex] || 'Value', value: Number(config.series[context.seriesIndex]) });
        }
        var total = entries.reduce(function (sum, entry) { return sum + (isFinite(entry.value) ? entry.value : 0); }, 0);
        return '<div class="dashboard-chart-tooltip">' +
            (heading != null ? '<strong>' + escHtml(heading) + '</strong>' : '') +
            entries.map(function (entry) {
                var percent = total ? ' · ' + DashboardUtils.fmtPct((entry.value / total) * 100, 1) : '';
                return '<span><b>' + escHtml(entry.name) + '</b> ' + escHtml(DashboardUtils.fmtNum(entry.value, 1) + percent) + (entry.trend ? ' <i aria-hidden="true">' + escHtml(entry.trend) + '</i>' : '') + '</span>';
            }).join('') + '</div>';
    }

    function _sparklineGlyph(values) {
        var blocks = '▁▂▃▄▅▆▇█';
        var numbers = (values || []).map(function (item) {
            var value = item && typeof item === 'object' ? (item.y != null ? item.y : item.value) : item;
            return Number(value);
        }).filter(isFinite);
        if (numbers.length < 2) return '';
        var min = Math.min.apply(null, numbers);
        var max = Math.max.apply(null, numbers);
        return numbers.slice(-12).map(function (value) {
            var index = max === min ? 3 : Math.round(((value - min) / (max - min)) * (blocks.length - 1));
            return blocks[index];
        }).join('');
    }

    function createAreaChart(containerId, labels, series, opts) {
        opts = Object.assign({}, opts || {}, { fill: true });
        return createLineChart(containerId, labels, series, opts);
    }

    function createComboChart(containerId, labels, series, opts) {
        opts = opts || {};
        return _renderApex(containerId, DashboardUtils.mergeDeep(_apexBase(opts), {
            chart: { type: 'line' },
            series: (series || []).map(function (item, index) {
                return { name: item.label || ('Series ' + (index + 1)), type: item.type || (index ? 'line' : 'column'), data: item.data };
            }),
            colors: _seriesColors(series),
            xaxis: { categories: labels },
            stroke: { width: (series || []).map(function (item) { return item.type === 'column' ? 0 : 3; }) },
            dataLabels: { enabled: true, enabledOnSeries: [0] },
        }), opts.chartOptions);
    }

    function createWaterfallChart(containerId, labels, values, opts) {
        opts = opts || {};
        var running = 0;
        var data = (values || []).map(function (value, index) {
            var start = running;
            running += Number(value) || 0;
            return { x: labels[index], y: [Math.min(start, running), Math.max(start, running)], fillColor: value < 0 ? PALETTE_STATUS.danger : PALETTE_STATUS.success };
        });
        return _renderApex(containerId, DashboardUtils.mergeDeep(_apexBase(opts), {
            chart: { type: 'rangeBar' }, series: [{ name: opts.label || 'Change', data: data }],
            plotOptions: { bar: { horizontal: false, columnWidth: '60%' } },
        }), opts.chartOptions);
    }

    function createFunnelChart(containerId, labels, values, opts) {
        opts = Object.assign({}, opts || {}, { horizontal: true, distributed: true });
        opts.chartOptions = DashboardUtils.mergeDeep({ plotOptions: { bar: { barHeight: '78%', isFunnel: true } } }, opts.chartOptions || {});
        return createBarChart(containerId, labels, values, opts);
    }

    function createGaugeChart(containerId, value, opts) {
        opts = opts || {};
        return _renderApex(containerId, DashboardUtils.mergeDeep(_apexBase(opts), {
            chart: { type: 'radialBar' }, series: [Number(value) || 0],
            labels: [opts.label || 'Value'], colors: [opts.color || PALETTE_CATEGORICAL[0]],
            plotOptions: { radialBar: { startAngle: -120, endAngle: 120, dataLabels: { value: { formatter: function (item) { return item + '%'; } } } } },
        }), opts.chartOptions);
    }

    function createBulletChart(containerId, labels, values, opts) {
        opts = opts || {};
        var targets = opts.targets || [];
        return _renderApex(containerId, DashboardUtils.mergeDeep(_apexBase(opts), {
            chart: { type: 'bar' },
            series: [{ name: opts.label || 'Actual', data: values.map(function (value, index) {
                return { x: labels[index], y: value, goals: targets[index] == null ? [] : [{ name: 'Target', value: targets[index], strokeColor: PALETTE_STATUS.warning, strokeWidth: 4 }] };
            }) }],
            plotOptions: { bar: { horizontal: true, borderRadius: 2 } },
        }), opts.chartOptions);
    }

    function createBoxPlotChart(containerId, series, opts) {
        opts = opts || {};
        return _renderApex(containerId, DashboardUtils.mergeDeep(_apexBase(opts), {
            chart: { type: 'boxPlot' }, series: [{ name: opts.label || 'Distribution', data: series }],
            plotOptions: { boxPlot: { colors: { upper: PALETTE_CATEGORICAL[0], lower: PALETTE_CATEGORICAL[1] } } },
        }), opts.chartOptions);
    }

    function createHistogramChart(containerId, values, opts) {
        opts = opts || {};
        var bins = Math.max(1, opts.bins || Math.ceil(Math.sqrt(values.length || 1)));
        var min = Math.min.apply(null, values);
        var max = Math.max.apply(null, values);
        var width = (max - min || 1) / bins;
        var counts = Array(bins).fill(0);
        values.forEach(function (value) { counts[Math.min(bins - 1, Math.floor((value - min) / width))]++; });
        var labels = counts.map(function (_, index) { return DashboardUtils.fmtNum(min + index * width, 1) + '–' + DashboardUtils.fmtNum(min + (index + 1) * width, 1); });
        return createBarChart(containerId, labels, counts, Object.assign({}, opts, { distributed: false, label: opts.label || 'Frequency' }));
    }

    function createPieChart(containerId, labels, values, opts) {
        return createDonutChart(containerId, labels, values, Object.assign({}, opts || {}, { type: 'pie' }));
    }

    function createSparklineChart(containerId, values, opts) {
        opts = opts || {};
        return _renderApex(containerId, DashboardUtils.mergeDeep(_apexBase(Object.assign({}, opts, { height: opts.height || 52, dataLabels: false })), {
            chart: { type: opts.type || 'line', sparkline: { enabled: true }, toolbar: { show: false } },
            series: [{ name: opts.label || 'Trend', data: values }], stroke: { curve: 'smooth', width: 2 },
            colors: [opts.color || PALETTE_CATEGORICAL[0]], tooltip: { enabled: true },
        }), opts.chartOptions);
    }

    function createTrendSparkline(containerId, series, opts) {
        return createSparklineChart(containerId, series.map(function (item) { return item && typeof item === 'object' ? item.value : item; }), opts);
    }

    function createTreeMapChart(containerId, data, opts) {
        opts = opts || {};
        return _renderD3Hierarchy(containerId, data, opts, 'treemap');
    }

    function createSunburstChart(containerId, data, opts) {
        opts = opts || {};
        return _renderD3Hierarchy(containerId, data, opts, 'sunburst');
    }

    function _chartHostWidth(host) {
        var visibleHost = document.querySelector('.tab-content.active .chart-host');
        return host.clientWidth || (visibleHost && visibleHost.clientWidth) || 640;
    }

    function _renderD3Hierarchy(containerId, data, opts, type) {
        if (!global.d3) throw new Error('D3 is not loaded');
        var host = document.getElementById(containerId);
        if (!host) throw new Error('Chart container not found: ' + containerId);
        host.innerHTML = '';
        var width = host.clientWidth || 640;
        var height = opts.height || 300;
        var rootData = data && data.children ? data : { name: opts.label || 'Total', children: data || [] };
        var root = d3.hierarchy(rootData).sum(function (item) { return Number(item.value) || 0; });
        var svg = d3.select(host).append('svg').attr('viewBox', '0 0 ' + width + ' ' + height).attr('role', 'img').attr('aria-label', opts.ariaLabel || (type + ' chart'));
        var color = d3.scaleOrdinal(PALETTE_CATEGORICAL);
        if (type === 'treemap') {
            d3.treemap().size([width, height]).padding(2)(root);
            var cells = svg.selectAll('g').data(root.leaves()).join('g').attr('transform', function (item) { return 'translate(' + item.x0 + ',' + item.y0 + ')'; });
            cells.append('rect').attr('width', function (item) { return Math.max(0, item.x1 - item.x0); }).attr('height', function (item) { return Math.max(0, item.y1 - item.y0); }).attr('fill', function (_, index) { return color(index); }).attr('tabindex', 0).attr('role', 'button').attr('aria-label', function (item) { return (item.data.name || item.data.label || 'Item') + ': ' + DashboardUtils.fmtNum(item.value); }).on('click keydown', function (event, item) { if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return; if (global.DashboardCore) DashboardCore.broadcastSelection({ source: containerId, label: item.data.name || item.data.label, value: item.value }); });
            cells.append('text').attr('x', 6).attr('y', 17).attr('fill', function (_, index) { return _contrastText(color(index)); }).attr('font-size', 11).text(function (item) { return item.data.name || item.data.label || ''; });
        } else {
            var radius = Math.min(width, height) / 2;
            d3.partition().size([2 * Math.PI, radius])(root);
            var arc = d3.arc().startAngle(function (item) { return item.x0; }).endAngle(function (item) { return item.x1; }).innerRadius(function (item) { return item.y0; }).outerRadius(function (item) { return item.y1 - 1; });
            var slices = svg.append('g').attr('transform', 'translate(' + width / 2 + ',' + height / 2 + ')').selectAll('path').data(root.descendants().slice(1)).join('path').attr('d', arc).attr('fill', function (item) { return color(item.depth + '-' + (item.parent && item.parent.data.name)); }).attr('tabindex', 0).attr('role', 'button').attr('aria-label', function (item) { return (item.data.name || item.data.label || 'Item') + ': ' + DashboardUtils.fmtNum(item.value); }).on('click keydown', function (event, item) { if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return; if (global.DashboardCore) DashboardCore.broadcastSelection({ source: containerId, label: item.data.name || item.data.label, value: item.value }); });
            slices.append('title').text(function (item) { return (item.data.name || item.data.label || '') + ': ' + DashboardUtils.fmtNum(item.value); });
        }
        return svg;
    }

    function createHeatmapChart(containerId, rows, opts) {
        opts = opts || {};
        if (!global.d3) throw new Error('D3 is not loaded');
        var host = document.getElementById(containerId);
        if (!host) throw new Error('Chart container not found: ' + containerId);
        host.innerHTML = '';
        var xKey = opts.xKey || 'x';
        var yKey = opts.yKey || 'y';
        var valueKey = opts.valueKey || 'value';
        var xValues = Array.from(new Set(rows.map(function (row) { return row[xKey]; })));
        var yValues = Array.from(new Set(rows.map(function (row) { return row[yKey]; })));
        var margin = { top: 20, right: 12, bottom: 42, left: 70 };
        var width = host.clientWidth || 640;
        var height = opts.height || 300;
        var plotWidth = Math.max(1, width - margin.left - margin.right);
        var plotHeight = Math.max(1, height - margin.top - margin.bottom);
        var xScale = d3.scaleBand().domain(xValues).range([0, plotWidth]).padding(0.08);
        var yScale = d3.scaleBand().domain(yValues).range([0, plotHeight]).padding(0.08);
        var extent = d3.extent(rows, function (row) { return Number(row[valueKey]) || 0; });
        var color = d3.scaleSequential(d3.interpolateBlues).domain(extent[0] === extent[1] ? [0, extent[1] || 1] : extent);
        var svg = d3.select(host).append('svg').attr('viewBox', '0 0 ' + width + ' ' + height).attr('role', 'img').attr('aria-label', opts.ariaLabel || 'Heat map');
        var plot = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
        plot.append('g').attr('transform', 'translate(0,' + plotHeight + ')').call(d3.axisBottom(xScale)).call(function (axis) { axis.selectAll('text').attr('fill', 'currentColor'); axis.selectAll('path,line').attr('stroke', 'currentColor'); });
        plot.append('g').call(d3.axisLeft(yScale)).call(function (axis) { axis.selectAll('text').attr('fill', 'currentColor'); axis.selectAll('path,line').attr('stroke', 'currentColor'); });
        var cells = plot.selectAll('rect').data(rows).join('rect')
            .attr('x', function (row) { return xScale(row[xKey]); }).attr('y', function (row) { return yScale(row[yKey]); })
            .attr('width', xScale.bandwidth()).attr('height', yScale.bandwidth()).attr('rx', 2)
            .attr('fill', function (row) { return color(Number(row[valueKey]) || 0); })
            .attr('tabindex', 0).attr('role', 'button')
            .attr('aria-label', function (row) { return row[yKey] + ', ' + row[xKey] + ': ' + DashboardUtils.fmtNum(row[valueKey]); })
            .on('click keydown', function (event, row) { if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return; if (global.DashboardCore) DashboardCore.broadcastSelection({ source: containerId, x: row[xKey], y: row[yKey], value: row[valueKey] }); });
        cells.append('title').text(function (row) { return row[yKey] + ', ' + row[xKey] + ': ' + DashboardUtils.fmtNum(row[valueKey]); });
        return svg;
    }

    function createPointMapChart(containerId, points, opts) { return _renderGeo(containerId, points, Object.assign({}, opts || {}, { mode: 'points' })); }
    function createFilledMapChart(containerId, features, opts) { return _renderGeo(containerId, features, Object.assign({}, opts || {}, { mode: 'filled', geoJson: features })); }
    function createLayeredMapChart(containerId, layers, opts) { return _renderGeo(containerId, layers, Object.assign({}, opts || {}, { mode: 'layers', geoJson: layers.geoJson || (opts && opts.geoJson) })); }

    function _renderGeo(containerId, data, opts) {
        if (!global.d3) throw new Error('D3 is not loaded');
        var host = document.getElementById(containerId);
        if (!host) throw new Error('Chart container not found: ' + containerId);
        host.innerHTML = '';
        var width = host.clientWidth || 640;
        var height = opts.height || 320;
        var svg = d3.select(host).append('svg').attr('viewBox', '0 0 ' + width + ' ' + height).attr('role', 'img').attr('aria-label', opts.ariaLabel || 'Geographic chart');
        var projection = d3.geoNaturalEarth1().fitSize([width, height], opts.geoJson || { type: 'Sphere' });
        var path = d3.geoPath(projection);
        if (opts.geoJson) svg.selectAll('path').data(opts.geoJson.features || []).join('path').attr('d', path).attr('fill', opts.fill || '#1e2c3a').attr('stroke', '#a6b5c4').attr('stroke-width', 0.5);
        var points = opts.mode === 'layers' ? (data.points || []) : (opts.mode === 'points' ? data : []);
        svg.selectAll('circle').data(points || []).join('circle').attr('cx', function (item) { return projection([item.longitude || item.lon, item.latitude || item.lat])[0]; }).attr('cy', function (item) { return projection([item.longitude || item.lon, item.latitude || item.lat])[1]; }).attr('r', function (item) { return Math.max(3, Number(item.size) || 4); }).attr('fill', PALETTE_CATEGORICAL[1]).attr('opacity', 0.8);
        return svg;
    }

    function createCustomVisual(containerId, configJson, opts) {
        opts = opts || {};
        var config = typeof configJson === 'string' ? JSON.parse(configJson) : configJson;
        config = config || {};
        return _renderD3Combo(containerId, (config.xaxis && config.xaxis.categories) || config.labels || [], config.series || [], Object.assign({}, opts, config));
    }

    function _renderD3Combo(containerId, labels, series, opts) {
        if (!global.d3) throw new Error('D3 is not loaded');
        var host = document.getElementById(containerId);
        if (!host) throw new Error('Chart container not found: ' + containerId);
        host.innerHTML = '';
        var width = host.clientWidth || 640;
        var height = opts.height || 300;
        var margin = { top: 22, right: (series || []).some(function (item) { return item.yAxis === 1; }) ? 48 : 16, bottom: 46, left: 46 };
        var plotWidth = Math.max(1, width - margin.left - margin.right);
        var plotHeight = Math.max(1, height - margin.top - margin.bottom);
        var normalized = (series || []).map(function (item, index) { return { name: item.name || item.label || ('Series ' + (index + 1)), type: item.type === 'spline' ? 'line' : (item.type || 'line'), data: item.data || [], yAxis: item.yAxis || 0, color: item.color || PALETTE_CATEGORICAL[index % PALETTE_CATEGORICAL.length] }; });
        var xScale = d3.scaleBand().domain(labels).range([0, plotWidth]).padding(0.28);
        function axisMax(axisIndex) { return d3.max(normalized.filter(function (item) { return item.yAxis === axisIndex; }).reduce(function (all, item) { return all.concat(item.data); }, []), function (value) { return Number(value) || 0; }) || 1; }
        var yLeft = d3.scaleLinear().domain([0, axisMax(0)]).nice().range([plotHeight, 0]);
        var yRight = d3.scaleLinear().domain([0, axisMax(1)]).nice().range([plotHeight, 0]);
        var svg = d3.select(host).append('svg').attr('viewBox', '0 0 ' + width + ' ' + height).attr('role', 'img').attr('aria-label', opts.ariaLabel || 'Combination chart');
        var plot = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
        plot.append('g').attr('transform', 'translate(0,' + plotHeight + ')').call(d3.axisBottom(xScale)).call(function (axis) { axis.selectAll('text').attr('fill', 'currentColor'); axis.selectAll('path,line').attr('stroke', 'currentColor'); });
        plot.append('g').call(d3.axisLeft(yLeft).ticks(5)).call(function (axis) { axis.selectAll('text').attr('fill', 'currentColor'); axis.selectAll('path,line').attr('stroke', 'currentColor'); });
        if (normalized.some(function (item) { return item.yAxis === 1; })) plot.append('g').attr('transform', 'translate(' + plotWidth + ',0)').call(d3.axisRight(yRight).ticks(5)).call(function (axis) { axis.selectAll('text').attr('fill', 'currentColor'); axis.selectAll('path,line').attr('stroke', 'currentColor'); });
        var columns = normalized.filter(function (item) { return item.type === 'column' || item.type === 'bar'; });
        var columnWidth = columns.length ? xScale.bandwidth() / columns.length : 0;
        columns.forEach(function (item, seriesIndex) {
            var scale = item.yAxis === 1 ? yRight : yLeft;
            plot.selectAll('.combo-column-' + seriesIndex).data(item.data).join('rect').attr('class', 'combo-column-' + seriesIndex)
                .attr('x', function (_, index) { return xScale(labels[index]) + seriesIndex * columnWidth; }).attr('y', function (value) { return scale(Number(value) || 0); })
                .attr('width', Math.max(2, columnWidth - 2)).attr('height', function (value) { return plotHeight - scale(Number(value) || 0); }).attr('fill', item.color).attr('tabindex', 0).attr('role', 'button')
                .attr('aria-label', function (value, index) { return item.name + ', ' + labels[index] + ': ' + DashboardUtils.fmtNum(value); }).append('title').text(function (value, index) { return item.name + ' · ' + labels[index] + ': ' + DashboardUtils.fmtNum(value); });
        });
        normalized.filter(function (item) { return item.type !== 'column' && item.type !== 'bar'; }).forEach(function (item, seriesIndex) {
            var scale = item.yAxis === 1 ? yRight : yLeft;
            var points = item.data.map(function (value, index) { return { label: labels[index], value: Number(value) || 0 }; });
            plot.append('path').datum(points).attr('fill', 'none').attr('stroke', item.color).attr('stroke-width', 3).attr('d', d3.line().x(function (point) { return xScale(point.label) + xScale.bandwidth() / 2; }).y(function (point) { return scale(point.value); }).curve(d3.curveMonotoneX));
            plot.selectAll('.combo-point-' + seriesIndex).data(points).join('circle').attr('class', 'combo-point-' + seriesIndex).attr('cx', function (point) { return xScale(point.label) + xScale.bandwidth() / 2; }).attr('cy', function (point) { return scale(point.value); }).attr('r', 5).attr('fill', item.color).attr('tabindex', 0).attr('role', 'button').attr('aria-label', function (point) { return item.name + ', ' + point.label + ': ' + DashboardUtils.fmtNum(point.value); }).append('title').text(function (point) { return item.name + ' · ' + point.label + ': ' + DashboardUtils.fmtNum(point.value); });
        });
        return svg;
    }

    function createParetoChart(containerId, labels, values, opts) {
        opts = opts || {};
        var total = (values || []).reduce(function (sum, value) { return sum + (Number(value) || 0); }, 0);
        var running = 0;
        var cumulative = (values || []).map(function (value) {
            running += Number(value) || 0;
            return total ? Number(((running / total) * 100).toFixed(1)) : 0;
        });
        return _renderD3Combo(containerId, labels, [
            { type: 'column', name: opts.label || 'Value', data: values, color: PALETTE_CATEGORICAL[1] },
            { type: 'line', name: 'Cumulative %', data: cumulative, yAxis: 1, color: '#b9e84a' },
        ], Object.assign({}, opts, { ariaLabel: opts.ariaLabel || 'Pareto chart' }));
    }

    function createGanttChart(containerId, rows, opts) {
        opts = opts || {};
        if (!global.d3) throw new Error('D3 is not loaded');
        var host = document.getElementById(containerId);
        if (!host) throw new Error('Chart container not found: ' + containerId);
        host.innerHTML = '';
        var data = (rows || []).map(function (row) { return Object.assign({}, row, { startDate: new Date(row.start), endDate: new Date(row.end) }); });
        var width = host.clientWidth || 640;
        var height = opts.height || 300;
        var margin = { top: 22, right: 16, bottom: 42, left: 92 };
        var plotWidth = Math.max(1, width - margin.left - margin.right);
        var plotHeight = Math.max(1, height - margin.top - margin.bottom);
        var xScale = d3.scaleUtc().domain(data.length ? [d3.min(data, function (row) { return row.startDate; }), d3.max(data, function (row) { return row.endDate; })] : [new Date(), new Date()]).nice().range([0, plotWidth]);
        var yScale = d3.scaleBand().domain(data.map(function (row) { return row.name || row.label; })).range([0, plotHeight]).padding(0.34);
        var svg = d3.select(host).append('svg').attr('viewBox', '0 0 ' + width + ' ' + height).attr('role', 'img').attr('aria-label', opts.ariaLabel || 'Gantt schedule');
        var plot = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
        plot.append('g').attr('transform', 'translate(0,' + plotHeight + ')').call(d3.axisBottom(xScale).ticks(Math.min(5, data.length + 2)).tickFormat(d3.utcFormat('%d %b'))).call(function (axis) { axis.selectAll('text').attr('fill', 'currentColor'); axis.selectAll('path,line').attr('stroke', 'currentColor'); });
        plot.append('g').call(d3.axisLeft(yScale).tickSize(0)).call(function (axis) { axis.selectAll('text').attr('fill', 'currentColor'); axis.select('.domain').remove(); });
        var byId = new Map(data.map(function (row) { return [row.id, row]; }));
        plot.append('g').attr('aria-hidden', 'true').selectAll('path').data(data.filter(function (row) { return row.dependency && byId.has(row.dependency); })).join('path').attr('d', function (row) {
            var source = byId.get(row.dependency);
            var sourceY = yScale(source.name || source.label) + yScale.bandwidth() / 2;
            var targetY = yScale(row.name || row.label) + yScale.bandwidth() / 2;
            var sourceX = xScale(source.endDate);
            var targetX = xScale(row.startDate);
            return 'M' + sourceX + ',' + sourceY + ' H' + ((sourceX + targetX) / 2) + ' V' + targetY + ' H' + targetX;
        }).attr('fill', 'none').attr('stroke', PALETTE_STATUS.neutral).attr('stroke-width', 1.5).attr('stroke-dasharray', '3 2');
        var tasks = plot.selectAll('.gantt-task').data(data).join('g').attr('class', 'gantt-task').attr('tabindex', 0).attr('role', 'button').attr('aria-label', function (row) { return (row.name || row.label) + ': ' + DashboardUtils.fmtDate(row.startDate) + ' to ' + DashboardUtils.fmtDate(row.endDate) + ', ' + Math.round((Number(row.completed) || 0) * 100) + '% complete'; });
        tasks.append('rect').attr('x', function (row) { return xScale(row.startDate); }).attr('y', function (row) { return yScale(row.name || row.label); }).attr('width', function (row) { return Math.max(2, xScale(row.endDate) - xScale(row.startDate)); }).attr('height', yScale.bandwidth()).attr('rx', 3).attr('fill', PALETTE_STATUS.neutral).attr('opacity', 0.45);
        tasks.append('rect').attr('x', function (row) { return xScale(row.startDate); }).attr('y', function (row) { return yScale(row.name || row.label); }).attr('width', function (row) { return Math.max(0, (xScale(row.endDate) - xScale(row.startDate)) * Math.min(1, Math.max(0, Number(row.completed) || 0))); }).attr('height', yScale.bandwidth()).attr('rx', 3).attr('fill', function (row) { return row.completed >= 1 ? PALETTE_STATUS.success : PALETTE_CATEGORICAL[0]; });
        tasks.append('title').text(function (row) { return (row.name || row.label) + ': ' + Math.round((Number(row.completed) || 0) * 100) + '% complete'; });
        return svg;
    }

    function createCalendarHeatmapChart(containerId, points, opts) {
        opts = opts || {};
        if (!global.d3) throw new Error('D3 is not loaded');
        var host = document.getElementById(containerId);
        if (!host) throw new Error('Chart container not found: ' + containerId);
        host.innerHTML = '';
        var data = (points || []).map(function (point) { return { date: d3.utcDay.floor(new Date(point.date != null ? point.date : point[0])), value: Number(point.value != null ? point.value : point[1]) || 0 }; });
        var width = _chartHostWidth(host);
        var height = opts.height || host.clientHeight || 300;
        var margin = { top: 30, right: 12, bottom: 34, left: 38 };
        var start = data.length ? d3.utcMonday.floor(d3.min(data, function (item) { return item.date; })) : new Date();
        var week = function (date) { return d3.utcMonday.count(start, date); };
        var weeks = data.length ? d3.max(data, function (item) { return week(item.date); }) + 1 : 1;
        var plotWidth = Math.max(1, width - margin.left - margin.right);
        var plotHeight = Math.max(1, height - margin.top - margin.bottom);
        var cellWidth = plotWidth / weeks;
        var cellHeight = plotHeight / 7;
        var gap = Math.max(1, Math.min(4, Math.min(cellWidth, cellHeight) * 0.1));
        var dateKey = d3.utcFormat('%Y-%m-%d');
        var valuesByDate = new Map(data.map(function (item) { return [dateKey(item.date), item]; }));
        var slots = d3.range(weeks * 7).map(function (index) {
            var date = d3.utcDay.offset(start, index);
            return { date: date, item: valuesByDate.get(dateKey(date)) || null };
        });
        var extent = d3.extent(data, function (item) { return item.value; });
        var color = d3.scaleSequential(d3.interpolateBlues).domain(extent[0] === extent[1] ? [0, extent[1] || 1] : extent);
        var svg = d3.select(host).append('svg').attr('viewBox', '0 0 ' + width + ' ' + height).style('display', 'block').style('width', '100%').style('height', height + 'px').attr('role', 'img').attr('aria-label', opts.ariaLabel || 'Calendar heat map');
        var plot = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
        var cells = plot.selectAll('.calendar-cell').data(slots).join('g').attr('class', 'calendar-cell').attr('transform', function (slot) { return 'translate(' + (week(slot.date) * cellWidth) + ',' + (((slot.date.getUTCDay() + 6) % 7) * cellHeight) + ')'; });
        cells.append('rect').attr('width', Math.max(2, cellWidth - gap)).attr('height', Math.max(2, cellHeight - gap)).attr('rx', Math.min(5, cellHeight * 0.16))
            .attr('fill', function (slot) { return slot.item ? color(slot.item.value) : 'var(--bg-secondary)'; }).attr('stroke', 'var(--border-color)').attr('stroke-width', 0.75)
            .attr('tabindex', function (slot) { return slot.item ? 0 : null; }).attr('role', function (slot) { return slot.item ? 'button' : null; }).attr('aria-hidden', function (slot) { return slot.item ? null : 'true'; })
            .attr('aria-label', function (slot) { return slot.item ? DashboardUtils.fmtDate(slot.date) + ': ' + DashboardUtils.fmtNum(slot.item.value) : null; })
            .append('title').text(function (slot) { return slot.item ? DashboardUtils.fmtDate(slot.date) + ': ' + DashboardUtils.fmtNum(slot.item.value) : DashboardUtils.fmtDate(slot.date) + ': no data'; });
        if (cellWidth >= 30 && cellHeight >= 22) {
            cells.append('text').attr('x', Math.min(8, cellWidth * 0.12)).attr('y', Math.min(13, cellHeight * 0.38)).attr('fill', 'currentColor').attr('font-size', 9).attr('opacity', 0.72).text(function (slot) { return slot.date.getUTCDate(); });
            cells.filter(function (slot) { return slot.item; }).append('text').attr('x', (cellWidth - gap) / 2).attr('y', cellHeight * 0.68).attr('text-anchor', 'middle').attr('fill', '#ffffff').attr('font-size', Math.min(12, cellHeight * 0.34)).attr('font-weight', 700).text(function (slot) { return DashboardUtils.fmtNum(slot.item.value); });
        }
        svg.append('g').attr('transform', 'translate(' + (margin.left - 6) + ',' + margin.top + ')').selectAll('text').data(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']).join('text').attr('x', 0).attr('y', function (_, index) { return index * cellHeight + cellHeight * 0.62; }).attr('text-anchor', 'end').attr('fill', 'currentColor').attr('font-size', 10).text(function (day) { return day; });
        svg.append('g').attr('transform', 'translate(' + margin.left + ',' + (margin.top - 8) + ')').selectAll('text').data(d3.range(weeks)).join('text').attr('x', function (index) { return index * cellWidth + cellWidth / 2; }).attr('text-anchor', 'middle').attr('fill', 'currentColor').attr('font-size', 10).text(function (index) { return cellWidth >= 62 ? d3.utcFormat('%d %b')(d3.utcDay.offset(start, index * 7)) : ''; });
        var legendValues = d3.range(5).map(function (index) { return extent[0] + ((extent[1] - extent[0]) * index / 4); });
        var legend = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + (height - 17) + ')').attr('aria-hidden', 'true');
        legend.append('text').attr('x', 0).attr('y', 4).attr('fill', 'currentColor').attr('font-size', 9).text(opts.label || 'Activity');
        legend.selectAll('rect').data(legendValues).join('rect').attr('x', function (_, index) { return 68 + index * 22; }).attr('y', -7).attr('width', 18).attr('height', 10).attr('rx', 2).attr('fill', function (value) { return color(value); });
        legend.append('text').attr('x', 66).attr('y', 15).attr('fill', 'currentColor').attr('font-size', 8).text(DashboardUtils.fmtNum(extent[0]));
        legend.append('text').attr('x', 68 + 4 * 22 + 18).attr('y', 15).attr('text-anchor', 'end').attr('fill', 'currentColor').attr('font-size', 8).text(DashboardUtils.fmtNum(extent[1]));
        return svg;
    }

    function createRadarChart(containerId, labels, series, opts) {
        opts = opts || {};
        if (!global.d3) throw new Error('D3 is not loaded');
        var host = document.getElementById(containerId);
        if (!host) throw new Error('Chart container not found: ' + containerId);
        host.innerHTML = '';
        var width = _chartHostWidth(host);
        var height = opts.height || host.clientHeight || 300;
        var radius = Math.max(20, Math.min((width - 120) / 2, (height - 82) / 2));
        var centerX = width / 2;
        var centerY = 26 + radius;
        var max = opts.max || d3.max((series || []).reduce(function (all, item) { return all.concat(item.data || []); }, [])) || 100;
        var angle = function (index) { return (Math.PI * 2 * index / labels.length) - Math.PI / 2; };
        var point = function (index, value) { var distance = radius * ((Number(value) || 0) / max); return [centerX + Math.cos(angle(index)) * distance, centerY + Math.sin(angle(index)) * distance]; };
        var svg = d3.select(host).append('svg').attr('viewBox', '0 0 ' + width + ' ' + height).style('display', 'block').style('width', '100%').style('height', height + 'px').attr('role', 'img').attr('aria-label', opts.ariaLabel || 'Radar chart');
        [1, 0.75, 0.5, 0.25].forEach(function (level, index) { svg.append('polygon').attr('points', labels.map(function (_, labelIndex) { return point(labelIndex, max * level).join(','); }).join(' ')).attr('fill', index % 2 ? 'var(--bg-secondary)' : 'none').attr('fill-opacity', 0.35).attr('stroke', 'currentColor').attr('stroke-width', level === 1 ? 1.25 : 0.75).attr('opacity', level === 1 ? 0.42 : 0.25); });
        labels.forEach(function (label, index) { var edge = point(index, max); var labelPoint = point(index, max * 1.17); var cosine = Math.cos(angle(index)); svg.append('line').attr('x1', centerX).attr('y1', centerY).attr('x2', edge[0]).attr('y2', edge[1]).attr('stroke', 'currentColor').attr('opacity', 0.28); svg.append('text').attr('x', labelPoint[0]).attr('y', labelPoint[1]).attr('dy', '0.35em').attr('text-anchor', cosine > 0.25 ? 'start' : cosine < -0.25 ? 'end' : 'middle').attr('fill', 'currentColor').attr('font-size', 10).attr('font-weight', 600).text(label); });
        (series || []).forEach(function (item, seriesIndex) { var color = item.color || PALETTE_CATEGORICAL[seriesIndex % PALETTE_CATEGORICAL.length]; var points = (item.data || []).map(function (value, index) { var coords = point(index, value); return { x: coords[0], y: coords[1], value: value, label: labels[index] }; }); svg.append('polygon').attr('points', points.map(function (itemPoint) { return itemPoint.x + ',' + itemPoint.y; }).join(' ')).attr('fill', color).attr('fill-opacity', 0.16).attr('stroke', color).attr('stroke-width', 2.5).attr('stroke-linejoin', 'round'); svg.selectAll('.radar-point-' + seriesIndex).data(points).join('circle').attr('class', 'radar-point-' + seriesIndex).attr('cx', function (itemPoint) { return itemPoint.x; }).attr('cy', function (itemPoint) { return itemPoint.y; }).attr('r', 4.5).attr('fill', color).attr('stroke', 'var(--bg-card)').attr('stroke-width', 1.5).attr('tabindex', 0).attr('role', 'button').attr('aria-label', function (itemPoint) { return (item.label || ('Series ' + (seriesIndex + 1))) + ', ' + itemPoint.label + ': ' + DashboardUtils.fmtNum(itemPoint.value); }).append('title').text(function (itemPoint) { return (item.label || ('Series ' + (seriesIndex + 1))) + ' · ' + itemPoint.label + ': ' + DashboardUtils.fmtNum(itemPoint.value); }); });
        var legendItems = (series || []).map(function (item, index) { return { label: item.label || ('Series ' + (index + 1)), color: item.color || PALETTE_CATEGORICAL[index % PALETTE_CATEGORICAL.length] }; });
        var legendWidth = legendItems.reduce(function (total, item) { return total + 28 + item.label.length * 6; }, 0);
        var legend = svg.append('g').attr('transform', 'translate(' + Math.max(8, (width - legendWidth) / 2) + ',' + (height - 15) + ')').attr('aria-hidden', 'true');
        var legendOffset = 0;
        legendItems.forEach(function (item) { var group = legend.append('g').attr('transform', 'translate(' + legendOffset + ',0)'); group.append('line').attr('x1', 0).attr('x2', 16).attr('stroke', item.color).attr('stroke-width', 3); group.append('circle').attr('cx', 8).attr('r', 3.5).attr('fill', item.color); group.append('text').attr('x', 22).attr('y', 3.5).attr('fill', 'currentColor').attr('font-size', 10).text(item.label); legendOffset += 28 + item.label.length * 6; });
        return svg;
    }

    function createAdvancedComboChart(containerId, labels, series, opts) {
        opts = opts || {};
        return _renderD3Combo(containerId, labels, series, Object.assign({}, opts, { ariaLabel: opts.ariaLabel || 'Advanced combination chart' }));
    }

    function createPackedBubbleChart(containerId, series, opts) {
        opts = opts || {};
        if (!global.d3) throw new Error('D3 is not loaded');
        var host = document.getElementById(containerId);
        if (!host) throw new Error('Chart container not found: ' + containerId);
        host.innerHTML = '';
        var width = host.clientWidth || 640;
        var height = opts.height || 300;
        var root = d3.hierarchy({ children: (series || []).map(function (group) { return (group.data || []).map(function (item) { return { name: item.name, value: Number(item.value) || 0, group: group.name }; }); }).reduce(function (all, items) { return all.concat(items); }, []) }).sum(function (item) { return item.value; });
        d3.pack().size([width, height]).padding(6)(root);
        var color = d3.scaleOrdinal(PALETTE_CATEGORICAL);
        var svg = d3.select(host).append('svg').attr('viewBox', '0 0 ' + width + ' ' + height).attr('role', 'img').attr('aria-label', opts.ariaLabel || 'Packed bubble chart');
        var nodes = svg.selectAll('g').data(root.leaves()).join('g').attr('transform', function (item) { return 'translate(' + item.x + ',' + item.y + ')'; });
        nodes.append('circle').attr('r', function (item) { return item.r; }).attr('fill', function (item) { return color(item.data.group); }).attr('opacity', 0.84).attr('tabindex', 0).attr('role', 'button').attr('aria-label', function (item) { return item.data.group + ', ' + item.data.name + ': ' + DashboardUtils.fmtNum(item.value); }).append('title').text(function (item) { return item.data.group + ' · ' + item.data.name + ': ' + DashboardUtils.fmtNum(item.value); });
        nodes.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em').attr('fill', '#ffffff').attr('font-size', function (item) { return Math.max(9, Math.min(12, item.r / 3)); }).text(function (item) { return item.r > 18 ? item.data.name : ''; });
        return svg;
    }

    function createLollipopChart(containerId, labels, values, opts) {
        opts = opts || {};
        if (!global.d3) throw new Error('D3 is not loaded');
        var host = document.getElementById(containerId);
        if (!host) throw new Error('Chart container not found: ' + containerId);
        host.innerHTML = '';
        var data = (labels || []).map(function (label, index) { return { label: label, value: Number(values[index]) || 0 }; });
        var width = host.clientWidth || 640;
        var height = opts.height || 300;
        var margin = { top: 22, right: 14, bottom: 46, left: 44 };
        var plotWidth = Math.max(1, width - margin.left - margin.right);
        var plotHeight = Math.max(1, height - margin.top - margin.bottom);
        var xScale = d3.scaleBand().domain(labels).range([0, plotWidth]).padding(0.45);
        var yScale = d3.scaleLinear().domain([0, d3.max(data, function (item) { return item.value; }) || 1]).nice().range([plotHeight, 0]);
        var svg = d3.select(host).append('svg').attr('viewBox', '0 0 ' + width + ' ' + height).attr('role', 'img').attr('aria-label', opts.ariaLabel || 'Lollipop chart');
        var plot = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
        plot.append('g').attr('transform', 'translate(0,' + plotHeight + ')').call(d3.axisBottom(xScale)).call(function (axis) { axis.selectAll('text').attr('fill', 'currentColor'); axis.selectAll('path,line').attr('stroke', 'currentColor'); });
        plot.append('g').call(d3.axisLeft(yScale).ticks(4)).call(function (axis) { axis.selectAll('text').attr('fill', 'currentColor'); axis.selectAll('path,line').attr('stroke', 'currentColor'); });
        var marks = plot.selectAll('.lollipop-mark').data(data).join('g').attr('class', 'lollipop-mark').attr('tabindex', 0).attr('role', 'button').attr('aria-label', function (item) { return item.label + ': ' + DashboardUtils.fmtNum(item.value); });
        marks.append('line').attr('x1', function (item) { return xScale(item.label) + xScale.bandwidth() / 2; }).attr('x2', function (item) { return xScale(item.label) + xScale.bandwidth() / 2; }).attr('y1', plotHeight).attr('y2', function (item) { return yScale(item.value); }).attr('stroke', opts.color || PALETTE_CATEGORICAL[1]).attr('stroke-width', 3);
        marks.append('circle').attr('cx', function (item) { return xScale(item.label) + xScale.bandwidth() / 2; }).attr('cy', function (item) { return yScale(item.value); }).attr('r', 7).attr('fill', opts.color || PALETTE_CATEGORICAL[1]);
        marks.append('text').attr('x', function (item) { return xScale(item.label) + xScale.bandwidth() / 2; }).attr('y', function (item) { return yScale(item.value) - 12; }).attr('text-anchor', 'middle').attr('fill', 'currentColor').attr('font-size', 10).text(function (item) { return DashboardUtils.fmtNum(item.value); });
        marks.append('title').text(function (item) { return item.label + ': ' + DashboardUtils.fmtNum(item.value); });
        return svg;
    }

    function createLipstickColumnChart(containerId, labels, series, opts) {
        opts = opts || {};
        if (!global.d3) throw new Error('D3 is not loaded');
        var host = document.getElementById(containerId);
        if (!host) throw new Error('Chart container not found: ' + containerId);
        host.innerHTML = '';
        var data = (labels || []).map(function (label, index) { return { label: label, reference: Number(series[0] && series[0].data[index]) || 0, actual: Number(series[1] && series[1].data[index]) || 0 }; });
        var width = host.clientWidth || 640;
        var height = opts.height || 300;
        var margin = { top: 22, right: 14, bottom: 46, left: 44 };
        var plotWidth = Math.max(1, width - margin.left - margin.right);
        var plotHeight = Math.max(1, height - margin.top - margin.bottom);
        var xScale = d3.scaleBand().domain(labels).range([0, plotWidth]).padding(0.42);
        var yScale = d3.scaleLinear().domain([0, d3.max(data, function (item) { return Math.max(item.reference, item.actual); }) || 1]).nice().range([plotHeight, 0]);
        var svg = d3.select(host).append('svg').attr('viewBox', '0 0 ' + width + ' ' + height).attr('role', 'img').attr('aria-label', opts.ariaLabel || 'Lipstick column chart');
        var plot = svg.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
        plot.append('g').attr('transform', 'translate(0,' + plotHeight + ')').call(d3.axisBottom(xScale)).call(function (axis) { axis.selectAll('text').attr('fill', 'currentColor'); axis.selectAll('path,line').attr('stroke', 'currentColor'); });
        plot.append('g').call(d3.axisLeft(yScale).ticks(4)).call(function (axis) { axis.selectAll('text').attr('fill', 'currentColor'); axis.selectAll('path,line').attr('stroke', 'currentColor'); });
        var marks = plot.selectAll('.lipstick-mark').data(data).join('g').attr('class', 'lipstick-mark').attr('tabindex', 0).attr('role', 'button').attr('aria-label', function (item) { return item.label + ', ' + (series[0] && series[0].label || 'Reference') + ': ' + DashboardUtils.fmtNum(item.reference) + ', ' + (series[1] && series[1].label || 'Actual') + ': ' + DashboardUtils.fmtNum(item.actual); });
        marks.append('rect').attr('x', function (item) { return xScale(item.label) + xScale.bandwidth() * 0.18; }).attr('y', function (item) { return yScale(item.reference); }).attr('width', xScale.bandwidth() * 0.64).attr('height', function (item) { return plotHeight - yScale(item.reference); }).attr('fill', series[0] && series[0].color || PALETTE_STATUS.warning).attr('opacity', 0.65);
        marks.append('rect').attr('x', function (item) { return xScale(item.label) + xScale.bandwidth() * 0.36; }).attr('y', function (item) { return yScale(item.actual); }).attr('width', xScale.bandwidth() * 0.28).attr('height', function (item) { return plotHeight - yScale(item.actual); }).attr('fill', series[1] && series[1].color || PALETTE_CATEGORICAL[0]);
        marks.append('title').text(function (item) { return item.label + ': ' + item.actual + ' / ' + item.reference; });
        return svg;
    }

    function _createD3Host(containerId, opts, ariaLabel) {
        if (!global.d3) throw new Error('D3 is not loaded');
        var host = document.getElementById(containerId);
        if (!host) throw new Error('Chart container not found: ' + containerId);
        host.innerHTML = '';
        var width = host.clientWidth || 640;
        var height = (opts && opts.height) || 300;
        return { width: width, height: height, svg: d3.select(host).append('svg').attr('viewBox', '0 0 ' + width + ' ' + height).attr('role', 'img').attr('aria-label', (opts && opts.ariaLabel) || ariaLabel) };
    }

    function createSankeyChart(containerId, nodes, links, opts) {
        opts = opts || {};
        var chart = _createD3Host(containerId, opts, 'Sankey flow diagram');
        var byId = new Map((nodes || []).map(function (node) { return [node.id, Object.assign({}, node)]; }));
        var depthCache = new Map();
        function depth(node) {
            if (depthCache.has(node.id)) return depthCache.get(node.id);
            var incoming = (links || []).filter(function (link) { return link.target === node.id; });
            var value = incoming.length ? 1 + d3.max(incoming, function (link) { return depth(byId.get(link.source)); }) : 0;
            depthCache.set(node.id, value);
            return value;
        }
        var maxDepth = d3.max(nodes || [], depth) || 1;
        var columns = d3.group(nodes || [], depth);
        columns.forEach(function (items, column) { items.forEach(function (node, index) { var copy = byId.get(node.id); copy.x = 42 + column * ((chart.width - 110) / maxDepth); copy.y = 34 + index * ((chart.height - 68) / Math.max(1, items.length)); }); });
        var values = (links || []).map(function (link) { return Number(link.value) || 0; });
        var stroke = d3.scaleLinear().domain([0, d3.max(values) || 1]).range([3, 18]);
        chart.svg.append('g').selectAll('path').data(links || []).join('path').attr('d', function (link) { var source = byId.get(link.source); var target = byId.get(link.target); return 'M' + (source.x + 14) + ',' + source.y + ' C' + ((source.x + target.x) / 2) + ',' + source.y + ' ' + ((source.x + target.x) / 2) + ',' + target.y + ' ' + (target.x - 14) + ',' + target.y; }).attr('fill', 'none').attr('stroke', PALETTE_CATEGORICAL[1]).attr('stroke-width', function (link) { return stroke(Number(link.value) || 0); }).attr('stroke-opacity', 0.35);
        var marks = chart.svg.append('g').selectAll('g').data(Array.from(byId.values())).join('g').attr('transform', function (node) { return 'translate(' + node.x + ',' + node.y + ')'; }).attr('tabindex', 0).attr('role', 'button').attr('aria-label', function (node) { return node.label || node.id; });
        marks.append('rect').attr('x', -14).attr('y', -15).attr('width', 28).attr('height', 30).attr('rx', 3).attr('fill', function (_, index) { return PALETTE_CATEGORICAL[index % PALETTE_CATEGORICAL.length]; });
        marks.append('text').attr('x', 19).attr('y', 4).attr('fill', 'currentColor').attr('font-size', 10).text(function (node) { return node.label || node.id; });
        return chart.svg;
    }

    function createChordChart(containerId, labels, matrix, opts) {
        opts = opts || {};
        var chart = _createD3Host(containerId, opts, 'Chord relationship diagram');
        var radius = Math.min(chart.width, chart.height) * 0.34;
        var chord = d3.chord().padAngle(0.06)(matrix || []);
        var color = d3.scaleOrdinal(PALETTE_CATEGORICAL);
        var root = chart.svg.append('g').attr('transform', 'translate(' + chart.width / 2 + ',' + chart.height / 2 + ')');
        root.append('g').selectAll('path').data(chord).join('path').attr('d', d3.ribbon().radius(radius - 16)).attr('fill', function (item) { return color(item.source.index); }).attr('fill-opacity', 0.28).append('title').text(function (item) { return labels[item.source.index] + ' to ' + labels[item.target.index] + ': ' + item.source.value; });
        var groups = root.append('g').selectAll('g').data(chord.groups).join('g').attr('tabindex', 0).attr('role', 'button').attr('aria-label', function (item) { return labels[item.index] + ': ' + item.value + ' relationships'; });
        groups.append('path').attr('d', d3.arc().innerRadius(radius - 12).outerRadius(radius)).attr('fill', function (item) { return color(item.index); });
        groups.append('text').attr('transform', function (item) { var angle = (item.startAngle + item.endAngle) / 2; return 'rotate(' + (angle * 180 / Math.PI - 90) + ') translate(' + (radius + 9) + ',0)' + (angle > Math.PI ? ' rotate(180)' : ''); }).attr('text-anchor', function (item) { return (item.startAngle + item.endAngle) / 2 > Math.PI ? 'end' : 'start'; }).attr('fill', 'currentColor').attr('font-size', 10).text(function (item) { return labels[item.index]; });
        return chart.svg;
    }

    function createNetworkGraph(containerId, nodes, links, opts) {
        opts = opts || {};
        var chart = _createD3Host(containerId, opts, 'Network relationship graph');
        var nodeData = (nodes || []).map(function (node) { return Object.assign({}, node); });
        var linkData = (links || []).map(function (link) { return Object.assign({}, link); });
        var simulation = d3.forceSimulation(nodeData).force('link', d3.forceLink(linkData).id(function (node) { return node.id; }).distance(72)).force('charge', d3.forceManyBody().strength(-160)).force('center', d3.forceCenter(chart.width / 2, chart.height / 2)).force('collide', d3.forceCollide(18)).stop();
        for (var tick = 0; tick < 180; tick++) simulation.tick();
        chart.svg.append('g').selectAll('line').data(linkData).join('line').attr('x1', function (link) { return link.source.x; }).attr('y1', function (link) { return link.source.y; }).attr('x2', function (link) { return link.target.x; }).attr('y2', function (link) { return link.target.y; }).attr('stroke', PALETTE_STATUS.neutral).attr('stroke-opacity', 0.55).attr('stroke-width', function (link) { return Math.max(1, Number(link.value) || 1); });
        var marks = chart.svg.append('g').selectAll('g').data(nodeData).join('g').attr('transform', function (node) { return 'translate(' + node.x + ',' + node.y + ')'; }).attr('tabindex', 0).attr('role', 'button').attr('aria-label', function (node) { return node.label || node.id; });
        marks.append('circle').attr('r', function (node) { return 8 + (Number(node.value) || 1); }).attr('fill', function (node, index) { return node.color || PALETTE_CATEGORICAL[index % PALETTE_CATEGORICAL.length]; });
        marks.append('text').attr('x', 13).attr('y', 4).attr('fill', 'currentColor').attr('font-size', 10).text(function (node) { return node.label || node.id; });
        return chart.svg;
    }

    function createTimelineChart(containerId, events, opts) {
        opts = opts || {};
        var chart = _createD3Host(containerId, opts, 'Milestone timeline');
        var data = (events || []).map(function (event) { return Object.assign({}, event, { parsedDate: new Date(event.date) }); });
        var xScale = d3.scaleUtc().domain(d3.extent(data, function (event) { return event.parsedDate; })).range([38, chart.width - 38]);
        var center = chart.height / 2;
        chart.svg.append('line').attr('x1', 38).attr('x2', chart.width - 38).attr('y1', center).attr('y2', center).attr('stroke', PALETTE_STATUS.neutral).attr('stroke-width', 2);
        var marks = chart.svg.selectAll('g').data(data).join('g').attr('transform', function (event) { return 'translate(' + xScale(event.parsedDate) + ',' + center + ')'; }).attr('tabindex', 0).attr('role', 'button').attr('aria-label', function (event) { return DashboardUtils.fmtDate(event.parsedDate) + ': ' + event.label; });
        marks.append('line').attr('y1', 0).attr('y2', function (_, index) { return index % 2 ? 58 : -58; }).attr('stroke', PALETTE_CATEGORICAL[1]);
        marks.append('circle').attr('r', 7).attr('fill', function (_, index) { return PALETTE_CATEGORICAL[index % PALETTE_CATEGORICAL.length]; });
        marks.append('text').attr('y', function (_, index) { return index % 2 ? 76 : -68; }).attr('text-anchor', 'middle').attr('fill', 'currentColor').attr('font-size', 10).text(function (event) { return event.label; });
        marks.append('text').attr('y', function (_, index) { return index % 2 ? 90 : -82; }).attr('text-anchor', 'middle').attr('fill', 'currentColor').attr('font-size', 9).attr('opacity', 0.7).text(function (event) { return d3.utcFormat('%d %b')(event.parsedDate); });
        return chart.svg;
    }

    function _distributionDensity(values, samples) {
        var extent = d3.extent(values);
        var bandwidth = Math.max(1, (extent[1] - extent[0]) / 7);
        return samples.map(function (sample) { return [sample, d3.mean(values, function (value) { var distance = Math.abs(sample - value) / bandwidth; return distance <= 1 ? 0.75 * (1 - distance * distance) / bandwidth : 0; }) || 0]; });
    }

    function createRidgelineChart(containerId, series, opts) {
        opts = opts || {};
        var chart = _createD3Host(containerId, opts, 'Ridgeline distribution plot');
        var allValues = (series || []).reduce(function (all, item) { return all.concat(item.values || []); }, []);
        var xScale = d3.scaleLinear().domain(d3.extent(allValues)).nice().range([64, chart.width - 18]);
        var samples = xScale.ticks(28);
        var densities = (series || []).map(function (item) { return { label: item.label, density: _distributionDensity(item.values || [], samples) }; });
        var maxDensity = d3.max(densities, function (item) { return d3.max(item.density, function (point) { return point[1]; }); }) || 1;
        var rowHeight = (chart.height - 36) / Math.max(1, densities.length);
        densities.forEach(function (item, index) { var baseline = 24 + (index + 0.8) * rowHeight; var area = d3.area().x(function (point) { return xScale(point[0]); }).y0(baseline).y1(function (point) { return baseline - (point[1] / maxDensity) * rowHeight * 0.8; }).curve(d3.curveBasis); chart.svg.append('path').datum(item.density).attr('d', area).attr('fill', PALETTE_CATEGORICAL[index % PALETTE_CATEGORICAL.length]).attr('fill-opacity', 0.55).attr('stroke', PALETTE_CATEGORICAL[index % PALETTE_CATEGORICAL.length]).attr('tabindex', 0).attr('role', 'button').attr('aria-label', item.label + ' distribution'); chart.svg.append('text').attr('x', 8).attr('y', baseline).attr('fill', 'currentColor').attr('font-size', 10).text(item.label); });
        chart.svg.append('g').attr('transform', 'translate(0,' + (chart.height - 18) + ')').call(d3.axisBottom(xScale).ticks(6)).call(function (axis) { axis.selectAll('text').attr('fill', 'currentColor'); axis.selectAll('path,line').attr('stroke', 'currentColor'); });
        return chart.svg;
    }

    function createViolinChart(containerId, series, opts) {
        opts = opts || {};
        var chart = _createD3Host(containerId, opts, 'Violin distribution plot');
        var allValues = (series || []).reduce(function (all, item) { return all.concat(item.values || []); }, []);
        var yScale = d3.scaleLinear().domain(d3.extent(allValues)).nice().range([chart.height - 38, 18]);
        var xScale = d3.scaleBand().domain((series || []).map(function (item) { return item.label; })).range([52, chart.width - 14]).padding(0.25);
        var samples = yScale.ticks(32);
        (series || []).forEach(function (item, index) { var density = _distributionDensity(item.values || [], samples); var maxDensity = d3.max(density, function (point) { return point[1]; }) || 1; var halfWidth = xScale.bandwidth() / 2; var center = xScale(item.label) + halfWidth; var area = d3.area().x0(function (point) { return center - (point[1] / maxDensity) * halfWidth; }).x1(function (point) { return center + (point[1] / maxDensity) * halfWidth; }).y(function (point) { return yScale(point[0]); }).curve(d3.curveBasis); chart.svg.append('path').datum(density).attr('d', area).attr('fill', PALETTE_CATEGORICAL[index % PALETTE_CATEGORICAL.length]).attr('fill-opacity', 0.55).attr('stroke', PALETTE_CATEGORICAL[index % PALETTE_CATEGORICAL.length]).attr('tabindex', 0).attr('role', 'button').attr('aria-label', item.label + ' distribution'); });
        chart.svg.append('g').attr('transform', 'translate(0,' + (chart.height - 38) + ')').call(d3.axisBottom(xScale)).call(function (axis) { axis.selectAll('text').attr('fill', 'currentColor'); axis.selectAll('path,line').attr('stroke', 'currentColor'); });
        chart.svg.append('g').attr('transform', 'translate(52,0)').call(d3.axisLeft(yScale).ticks(5)).call(function (axis) { axis.selectAll('text').attr('fill', 'currentColor'); axis.selectAll('path,line').attr('stroke', 'currentColor'); });
        return chart.svg;
    }

    function createMarimekkoChart(containerId, categories, series, opts) {
        opts = opts || {};
        var chart = _createD3Host(containerId, opts, 'Marimekko chart');
        var totals = categories.map(function (_, categoryIndex) { return d3.sum(series, function (item) { return Number(item.data[categoryIndex]) || 0; }); });
        var grandTotal = d3.sum(totals) || 1;
        var left = 24;
        categories.forEach(function (category, categoryIndex) { var columnWidth = (chart.width - 48) * totals[categoryIndex] / grandTotal; var running = chart.height - 30; series.forEach(function (item, seriesIndex) { var value = Number(item.data[categoryIndex]) || 0; var height = (chart.height - 54) * value / (totals[categoryIndex] || 1); chart.svg.append('rect').attr('x', left).attr('y', running - height).attr('width', Math.max(1, columnWidth - 2)).attr('height', height).attr('fill', item.color || PALETTE_CATEGORICAL[seriesIndex % PALETTE_CATEGORICAL.length]).attr('tabindex', 0).attr('role', 'button').attr('aria-label', category + ', ' + item.label + ': ' + DashboardUtils.fmtNum(value)).append('title').text(category + ' · ' + item.label + ': ' + DashboardUtils.fmtNum(value)); running -= height; }); chart.svg.append('text').attr('x', left + columnWidth / 2).attr('y', chart.height - 12).attr('text-anchor', 'middle').attr('fill', 'currentColor').attr('font-size', 9).text(category); left += columnWidth; });
        return chart.svg;
    }

    function createStreamgraphChart(containerId, labels, series, opts) {
        opts = opts || {};
        var chart = _createD3Host(containerId, opts, 'Streamgraph');
        var keys = (series || []).map(function (item) { return item.label; });
        var rows = labels.map(function (label, index) { var row = { label: label }; series.forEach(function (item) { row[item.label] = Number(item.data[index]) || 0; }); return row; });
        var stack = d3.stack().keys(keys).offset(d3.stackOffsetWiggle).order(d3.stackOrderInsideOut)(rows);
        var xScale = d3.scalePoint().domain(labels).range([42, chart.width - 16]);
        var yScale = d3.scaleLinear().domain([d3.min(stack, function (layer) { return d3.min(layer, function (point) { return point[0]; }); }), d3.max(stack, function (layer) { return d3.max(layer, function (point) { return point[1]; }); })]).range([chart.height - 38, 18]);
        var area = d3.area().x(function (_, index) { return xScale(labels[index]); }).y0(function (point) { return yScale(point[0]); }).y1(function (point) { return yScale(point[1]); }).curve(d3.curveBasis);
        chart.svg.selectAll('path').data(stack).join('path').attr('d', area).attr('fill', function (_, index) { return PALETTE_CATEGORICAL[index % PALETTE_CATEGORICAL.length]; }).attr('fill-opacity', 0.76).attr('tabindex', 0).attr('role', 'button').attr('aria-label', function (layer) { return layer.key + ' stream'; });
        chart.svg.append('g').attr('transform', 'translate(0,' + (chart.height - 34) + ')').call(d3.axisBottom(xScale)).call(function (axis) { axis.selectAll('text').attr('fill', 'currentColor'); axis.selectAll('path,line').attr('stroke', 'currentColor'); });
        return chart.svg;
    }

    function createSmallMultiplesChart(containerId, labels, series, opts) {
        opts = opts || {};
        var chart = _createD3Host(containerId, opts, 'Small multiples panel');
        var columns = Math.min(3, Math.max(1, series.length));
        var rows = Math.ceil(series.length / columns);
        var panelWidth = chart.width / columns;
        var panelHeight = chart.height / rows;
        var maxValue = d3.max(series, function (item) { return d3.max(item.data, function (value) { return Number(value) || 0; }); }) || 1;
        series.forEach(function (item, index) { var panelX = (index % columns) * panelWidth; var panelY = Math.floor(index / columns) * panelHeight; var xScale = d3.scalePoint().domain(labels).range([panelX + 24, panelX + panelWidth - 12]); var yScale = d3.scaleLinear().domain([0, maxValue]).range([panelY + panelHeight - 24, panelY + 24]); var points = item.data.map(function (value, valueIndex) { return { label: labels[valueIndex], value: Number(value) || 0 }; }); chart.svg.append('rect').attr('x', panelX + 4).attr('y', panelY + 4).attr('width', panelWidth - 8).attr('height', panelHeight - 8).attr('fill', 'none').attr('stroke', 'currentColor').attr('opacity', 0.16); chart.svg.append('text').attr('x', panelX + 12).attr('y', panelY + 18).attr('fill', 'currentColor').attr('font-size', 10).text(item.label); chart.svg.append('path').datum(points).attr('fill', 'none').attr('stroke', item.color || PALETTE_CATEGORICAL[index % PALETTE_CATEGORICAL.length]).attr('stroke-width', 2).attr('d', d3.line().x(function (point) { return xScale(point.label); }).y(function (point) { return yScale(point.value); }).curve(d3.curveMonotoneX)); chart.svg.selectAll('.multiple-' + index).data(points).join('circle').attr('class', 'multiple-' + index).attr('cx', function (point) { return xScale(point.label); }).attr('cy', function (point) { return yScale(point.value); }).attr('r', 3).attr('fill', item.color || PALETTE_CATEGORICAL[index % PALETTE_CATEGORICAL.length]).attr('tabindex', 0).attr('role', 'button').attr('aria-label', function (point) { return item.label + ', ' + point.label + ': ' + DashboardUtils.fmtNum(point.value); }); });
        return chart.svg;
    }

    function _seriesColors(series) {
        return (series || []).map(function (item, index) { return item.color || PALETTE_CATEGORICAL[index % PALETTE_CATEGORICAL.length]; });
    }

    function _contrastText(hex) {
        var value = String(hex || '').replace('#', '');
        if (value.length !== 6) return '#ffffff';
        var red = parseInt(value.slice(0, 2), 16);
        var green = parseInt(value.slice(2, 4), 16);
        var blue = parseInt(value.slice(4, 6), 16);
        return ((red * 299 + green * 587 + blue * 114) / 1000) > 145 ? '#08111a' : '#ffffff';
    }

    function createDataTable(containerId, columns, rows, opts) {
        opts = opts || {};
        var host = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
        if (!host) throw new Error('Table container not found: ' + containerId);
        var normalized = (columns || []).map(function (column) { return typeof column === 'string' ? { key: column, label: column } : column; });
        var state = { sortKey: null, ascending: true, query: '', page: 1, pageSize: opts.pageSize || 25 };
        var sparklineCounter = 0;
        var wrapper = document.createElement('div');
        wrapper.className = 'data-table-wrap';
        var controls = document.createElement('div');
        controls.className = 'data-table-controls';
        var search = document.createElement('input');
        search.type = 'search';
        search.className = 'search-input';
        search.placeholder = opts.searchPlaceholder || 'Filter rows';
        search.setAttribute('aria-label', 'Filter table rows');
        controls.appendChild(search);
        var tableRegion = document.createElement('div');
        tableRegion.className = 'data-table-scroll';
        var pager = document.createElement('div');
        pager.className = 'data-table-pager';
        wrapper.appendChild(controls);
        wrapper.appendChild(tableRegion);
        wrapper.appendChild(pager);
        host.innerHTML = '';
        host.appendChild(wrapper);

        search.addEventListener('input', function () { state.query = this.value.toLowerCase(); state.page = 1; render(); });

        function render() {
            var sparklineJobs = [];
            var filtered = (rows || []).filter(function (row) {
                return !state.query || normalized.some(function (column) { return String(row[column.key] == null ? '' : row[column.key]).toLowerCase().indexOf(state.query) !== -1; });
            });
            if (state.sortKey) filtered.sort(function (left, right) {
                var a = left[state.sortKey];
                var b = right[state.sortKey];
                var result = typeof a === 'number' && typeof b === 'number' ? a - b : String(a == null ? '' : a).localeCompare(String(b == null ? '' : b));
                return state.ascending ? result : -result;
            });
            var pageCount = Math.max(1, Math.ceil(filtered.length / state.pageSize));
            state.page = Math.min(state.page, pageCount);
            var pageRows = filtered.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
            var table = document.createElement('table');
            table.className = 'data-table';
            var thead = document.createElement('thead');
            var headerRow = document.createElement('tr');
            normalized.forEach(function (column) {
                var th = document.createElement('th');
                var button = document.createElement('button');
                button.type = 'button';
                button.textContent = column.label || column.key;
                button.setAttribute('aria-label', 'Sort by ' + (column.label || column.key));
                if (state.sortKey === column.key) button.setAttribute('aria-sort', state.ascending ? 'ascending' : 'descending');
                if (column.description) { button.classList.add('has-definition'); button.title = column.description; }
                button.addEventListener('click', function () { state.ascending = state.sortKey === column.key ? !state.ascending : true; state.sortKey = column.key; render(); });
                th.appendChild(button);
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            table.appendChild(thead);
            var tbody = document.createElement('tbody');
            pageRows.forEach(function (row) {
                var tr = document.createElement('tr');
                normalized.forEach(function (column) {
                    var td = document.createElement('td');
                    var value = row[column.key];
                    if (column.sparkline && Array.isArray(value)) {
                        var sparkline = document.createElement('div');
                        sparkline.id = 'table-sparkline-' + (++sparklineCounter);
                        sparkline.className = 'table-sparkline';
                        sparkline.setAttribute('aria-label', (column.label || column.key) + ' trend');
                        td.appendChild(sparkline);
                        sparklineJobs.push({ id: sparkline.id, values: value, opts: column.sparklineOptions || {} });
                    } else {
                        td.textContent = _formatTableValue(value, column);
                    }
                    if (column.thresholds) td.classList.add('status-' + DashboardUtils.classifyValue(value, column.thresholds));
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            tableRegion.innerHTML = '';
            tableRegion.appendChild(table);
            sparklineJobs.forEach(function (job) { createSparklineChart(job.id, job.values, Object.assign({ height: 42 }, job.opts)); });
            pager.innerHTML = '';
            var previous = document.createElement('button');
            previous.type = 'button'; previous.textContent = 'Previous'; previous.disabled = state.page === 1;
            previous.addEventListener('click', function () { state.page--; render(); });
            var status = document.createElement('span');
            status.textContent = 'Page ' + state.page + ' of ' + pageCount + ' · ' + filtered.length + ' rows';
            status.setAttribute('aria-live', 'polite');
            var next = document.createElement('button');
            next.type = 'button'; next.textContent = 'Next'; next.disabled = state.page === pageCount;
            next.addEventListener('click', function () { state.page++; render(); });
            pager.appendChild(previous); pager.appendChild(status); pager.appendChild(next);
        }
        render();
        return { el: wrapper, refresh: render, state: state };
    }

    function _formatTableValue(value, column) {
        if (value == null) return '';
        var formatted;
        if (column.type === 'date') formatted = DashboardUtils.fmtDate(value);
        else if (column.type === 'number') formatted = DashboardUtils.fmtNum(value, column.decimals);
        else if (column.type === 'percent') formatted = DashboardUtils.fmtPct(value, column.decimals);
        else formatted = String(value);
        return column.unit ? formatted + ' ' + column.unit : formatted;
    }

    function createPanelGroup(containerId, opts) {
        opts = opts || {};
        var host = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
        if (!host) throw new Error('Panel group container not found: ' + containerId);
        var group = document.createElement('section');
        group.className = 'panel-group';
        group.setAttribute('aria-label', opts.label || 'Dashboard panel group');
        if (opts.columns) group.style.setProperty('--panel-group-columns', String(opts.columns));
        host.appendChild(group);
        return { el: group, append: function (card) { group.appendChild(card.el || card); } };
    }

    function createPivotTable(containerId, rows, opts) {
        opts = opts || {};
        var rowKey = opts.rowKey;
        var columnKey = opts.columnKey;
        var valueKey = opts.valueKey;
        var columns = Array.from(new Set(rows.map(function (row) { return row[columnKey]; })));
        var grouped = {};
        rows.forEach(function (row) {
            var key = String(row[rowKey]);
            if (!grouped[key]) grouped[key] = {};
            var column = String(row[columnKey]);
            grouped[key][column] = (grouped[key][column] || 0) + (Number(row[valueKey]) || 0);
        });
        var outputRows = Object.keys(grouped).map(function (key) {
            var result = {}; result[rowKey] = key;
            columns.forEach(function (column) { result[column] = grouped[key][String(column)] || 0; });
            return result;
        });
        var definitions = [{ key: rowKey, label: opts.rowLabel || rowKey }].concat(columns.map(function (column) { return { key: column, label: String(column), thresholds: opts.thresholds }; }));
        return createDataTable(containerId, definitions, outputRows, opts);
    }

    function openDrilldownModal(rows, columns, opts) {
        opts = opts || {};
        var content = document.getElementById('detailModal-content');
        if (!content || !global.DashboardCore) return null;
        DashboardCore.openDetail(opts.title || 'Detail', '');
        return createDataTable(content, columns, rows, opts);
    }

    function createInsightVisual(containerId, series, opts) {
        opts = opts || {};
        var host = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
        if (!host) throw new Error('Insight container not found: ' + containerId);
        var delta = DashboardUtils.computePeriodDelta(series || [], opts.period || 'mom');
        var narrative = opts.text;
        if (!narrative) {
            if (delta.current == null) narrative = 'Not enough historical data to calculate a period comparison.';
            else narrative = (opts.metric || 'Metric') + ' is ' + delta.direction + ' ' + DashboardUtils.fmtPct(Math.abs(delta.pct), 1) + ' versus the previous period.';
        }
        var card = document.createElement('div');
        card.className = 'insight-visual status-' + DashboardUtils.classifyValue(Math.abs(delta.pct), opts.thresholds);
        var heading = document.createElement('strong'); heading.textContent = opts.title || 'Insight';
        var text = document.createElement('p'); text.textContent = narrative;
        card.appendChild(heading); card.appendChild(text); host.appendChild(card);
        return { el: card, delta: delta, narrative: narrative };
    }

    function suggestedInsights(rows, opts) {
        opts = opts || {};
        var metrics = opts.metrics || [];
        var limit = opts.limit || 5;
        return metrics.map(function (metric) {
            var values = rows.map(function (row) { return Number(row[metric.key]); }).filter(isFinite);
            var delta = DashboardUtils.computePeriodDelta(values, metric.period || opts.period || 'mom');
            return { key: metric.key, label: metric.label || metric.key, delta: delta, score: Math.abs(delta.pct || 0) };
        }).sort(function (left, right) { return right.score - left.score; }).slice(0, limit);
    }

    function exportData(rows, format, opts) {
        format = String(format || 'json').toLowerCase();
        opts = opts || {};
        rows = _exportRows(rows || [], opts.columns);
        var content;
        var mime;
        if (format === 'json') { content = JSON.stringify(rows || [], null, 2); mime = 'application/json'; }
        else if (format === 'csv') { content = _toCsv(rows || []); mime = 'text/csv'; }
        else if (format === 'xml') { content = _toXml(rows || []); mime = 'application/xml'; }
        else throw new Error('Unsupported export format: ' + format);
        if (opts.download !== false) {
            var link = document.createElement('a');
            link.href = URL.createObjectURL(new Blob([content], { type: mime }));
            link.download = (opts.filename || 'dashboard-data') + '.' + format;
            link.click();
            window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 0);
        }
        return content;
    }

    function _exportRows(rows, columns) {
        if (!columns || !columns.length) return rows;
        return rows.map(function (row) {
            var output = {};
            columns.forEach(function (column) {
                var definition = typeof column === 'string' ? { key: column, label: column } : column;
                output[definition.label || definition.key] = row[definition.key];
            });
            return output;
        });
    }

    function _toCsv(rows) {
        if (!rows.length) return '';
        var keys = Object.keys(rows[0]);
        function quote(value) { return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"'; }
        return [keys.map(quote).join(',')].concat(rows.map(function (row) { return keys.map(function (key) { return quote(row[key]); }).join(','); })).join('\r\n');
    }

    function _toXml(rows) {
        function xml(value) { return DashboardUtils.escHtml(value == null ? '' : value); }
        return '<?xml version="1.0" encoding="UTF-8"?><rows>' + rows.map(function (row) { return '<row>' + Object.keys(row).map(function (key) { return '<field name="' + xml(key) + '">' + xml(row[key]) + '</field>'; }).join('') + '</row>'; }).join('') + '</rows>';
    }

    /* ─────────────────────────────────────────────────────────────────
       DATA UTILITIES
       ───────────────────────────────────────────────────────────────── */

    /**
     * Apply active filters to a flat array of row objects.
     * @param {object[]} rows
     * @param {{ key: string[] }} filterMap — from DashboardCore.getActiveFilters()
     * @returns {object[]}
     */
    function applyFilters(rows, filterMap) {
        filterMap = filterMap || {};
        return rows.filter(function (row) {
            return Object.keys(filterMap).every(function (key) {
                var allowed = filterMap[key];
                if (!allowed || allowed.length === 0) return true;
                return allowed.indexOf(String(row[key])) !== -1;
            });
        });
    }

    /**
     * Group rows by a key and aggregate a numeric field.
     * @param {object[]} rows
     * @param {string}   groupKey
     * @param {string}   valueKey
     * @param {'sum'|'count'|'avg'} [aggregation]
     * @returns {{ label: string, value: number }[]}
     */
    function groupBy(rows, groupKey, valueKey, aggregation) {
        aggregation = aggregation || 'sum';
        var map = {};
        var counts = {};

        rows.forEach(function (row) {
            var g = String(row[groupKey] != null ? row[groupKey] : '(blank)');
            if (!map[g])    { map[g] = 0; counts[g] = 0; }
            map[g]    += parseFloat(row[valueKey]) || 0;
            counts[g] += 1;
        });

        return Object.keys(map).map(function (g) {
            var val = (aggregation === 'count') ? counts[g]
                    : (aggregation === 'avg'  ) ? (counts[g] > 0 ? map[g] / counts[g] : 0)
                    : map[g];
            return { label: g, value: Math.round(val * 100) / 100 };
        });
    }

    /**
     * Decompress + parse a pako-deflated, base64-encoded CSV string.
     * Useful for large embedded datasets.
     *
     * @param {string} b64  — base64 string (as stored in const xxxB64)
     * @returns {object[]}  — parsed CSV rows (using PapaParse if available)
     */
    function decodeB64Csv(b64, papaOpts) {
        if (!global.pako) throw new Error('pako is not loaded');
        var bytes     = DashboardUtils.base64ToUint8Array(b64);
        var csv       = pako.inflate(bytes, { to: 'string' });
        // Strip BOM if present
        if (csv.charCodeAt(0) === 0xFEFF) csv = csv.slice(1);

        if (global.Papa) {
            var result = Papa.parse(csv, Object.assign({
                header: true,
                skipEmptyLines: true,
                dynamicTyping: true,
            }, papaOpts || {}));
            return result.data;
        }

        // Minimal fallback CSV parser (header + rows, comma-delimited)
        var lines  = csv.split('\n').filter(Boolean);
        var headers = lines[0].split(',').map(function (h) { return h.trim(); });
        return lines.slice(1).map(function (line) {
            var cols = line.split(',');
            var obj  = {};
            headers.forEach(function (h, i) { obj[h] = cols[i] !== undefined ? cols[i].trim() : ''; });
            return obj;
        });
    }

    /* ─────────────────────────────────────────────────────────────────
       FORMAT HELPERS
       ───────────────────────────────────────────────────────────────── */

    /** Format a number — delegates to DashboardUtils. */
    function fmtNum(n, decimals)  { return DashboardUtils.fmtNum(n, decimals); }

    /** Format as percentage — delegates to DashboardUtils. */
    function fmtPct(n, decimals)  { return DashboardUtils.fmtPct(n, decimals); }

    /* ─────────────────────────────────────────────────────────────────
       INIT HOOK — override this in your page script
       ───────────────────────────────────────────────────────────────── */

    /**
     * Default init does nothing except call _buildTabs().
     * Override DashboardCharts._buildTabs to inject your charts.
     */
    function init(config) {
        _registerDefaults();

        global.addEventListener('dashboardthemechange', function (event) {
            _chartInstances = _chartInstances.filter(function (chart) {
                try {
                    chart.updateOptions({ theme: { mode: event.detail.theme }, chart: { foreColor: getComputedStyle(document.documentElement).getPropertyValue('--chart-label').trim() } }, false, false);
                    return true;
                } catch (err) { return false; }
            });
        });

        // Register filter-change hook so charts can redraw on filter apply
        if (global.DashboardCore) {
            DashboardCore.onFilterChange(function (activeFilters) {
                if (typeof DashboardCharts._onFilterChange === 'function') {
                    DashboardCharts._onFilterChange(activeFilters, config);
                }
            });
        }

        // Defer _buildTabs so the DOM is fully ready
        window.setTimeout(function () {
            DashboardCharts._buildTabs(config);
            // Hide loader once charts are done
            if (global.DashboardCore) DashboardCore.hideLoader();
        }, 0);
    }

    /**
     * Override this function to build your chart cards.
     *
     * Example:
     *  DashboardCharts._buildTabs = function(config) {
     *      var grid = document.getElementById('tab1-grid');
     *      var card = DashboardCharts.createCard('Monthly Cases', 'full-width');
     *      grid.appendChild(card.el);
     *      DashboardCharts.createBarChart(
     *          card.canvasId,
     *          ['Jan','Feb','Mar'],
     *          [120, 135, 98]
     *      );
     *  };
     */
    function _buildTabs(config) {
        // --- PLACEHOLDER: replace with real chart logic ---
        var tabs = (config && config.tabs) || [];
        tabs.forEach(function (tab) {
            var grid = document.getElementById(tab.id + '-grid');
            if (!grid) return;

            var card = createCard(
                tab.label + ' — Sample Chart',
                'full-width',
                'Replace this placeholder by overriding DashboardCharts._buildTabs().'
            );
            grid.appendChild(card.el);

            // Render a sample chart so the template is immediately functional
            var sampleLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
            var sampleValues = sampleLabels.map(function () {
                return Math.round(50 + Math.random() * 150);
            });
            createBarChart(card.canvasId, sampleLabels, sampleValues, {
                label: 'Sample Metric',
            });
        });
    }

    /* ─────────────────────────────────────────────────────────────────
       PRIVATE UTILITIES
       ───────────────────────────────────────────────────────────────── */

    function _autoColors(n) {
        var out = [];
        for (var i = 0; i < n; i++) {
            out.push(PALETTE_CATEGORICAL[i % PALETTE_CATEGORICAL.length]);
        }
        return out;
    }

    function _statusColor(cls) {
        return PALETTE_STATUS[cls] || PALETTE_STATUS.neutral;
    }

    /* ─────────────────────────────────────────────────────────────────
       EXPORT
       ───────────────────────────────────────────────────────────────── */

    global.DashboardCharts = {
        // Lifecycle
        init:                init,
        _buildTabs:          _buildTabs,     // override per-dashboard
        _onFilterChange:     null,           // set to fn(activeFilters, config)

        // Card builders
        createCard:          createCard,
        createKpiCard:       createKpiCard,
        addInsightPanel:     addInsightPanel,

        // Chart factories
        createBarChart:      createBarChart,
        createLineChart:     createLineChart,
        createAreaChart:     createAreaChart,
        createComboChart:    createComboChart,
        createWaterfallChart: createWaterfallChart,
        createFunnelChart:   createFunnelChart,
        createGaugeChart:    createGaugeChart,
        createBulletChart:   createBulletChart,
        createDonutChart:    createDonutChart,
        createPieChart:      createPieChart,
        createScatterChart:  createScatterChart,
        createStackedBarChart: createStackedBarChart,
        createBoxPlotChart:  createBoxPlotChart,
        createHistogramChart: createHistogramChart,
        createTreeMapChart:  createTreeMapChart,
        createSunburstChart: createSunburstChart,
        createHeatmapChart:  createHeatmapChart,
        createPointMapChart: createPointMapChart,
        createFilledMapChart: createFilledMapChart,
        createLayeredMapChart: createLayeredMapChart,
        createSparklineChart: createSparklineChart,
        createTrendSparkline: createTrendSparkline,
        createParetoChart: createParetoChart,
        createGanttChart: createGanttChart,
        createCalendarHeatmapChart: createCalendarHeatmapChart,
        createRadarChart: createRadarChart,
        createAdvancedComboChart: createAdvancedComboChart,
        createPackedBubbleChart: createPackedBubbleChart,
        createLollipopChart: createLollipopChart,
        createLipstickColumnChart: createLipstickColumnChart,
        createCustomVisual: createCustomVisual,
        createSankeyChart: createSankeyChart,
        createChordChart: createChordChart,
        createNetworkGraph: createNetworkGraph,
        createTimelineChart: createTimelineChart,
        createRidgelineChart: createRidgelineChart,
        createViolinChart: createViolinChart,
        createMarimekkoChart: createMarimekkoChart,
        createStreamgraphChart: createStreamgraphChart,
        createSmallMultiplesChart: createSmallMultiplesChart,

        // Native reporting and narratives
        createDataTable: createDataTable,
        createPivotTable: createPivotTable,
        createPanelGroup: createPanelGroup,
        openDrilldownModal: openDrilldownModal,
        createInsightVisual: createInsightVisual,
        suggestedInsights: suggestedInsights,
        exportData: exportData,

        // Data helpers
        applyFilters:        applyFilters,
        groupBy:             groupBy,
        decodeB64Csv:        decodeB64Csv,

        // Format helpers
        fmtNum:              fmtNum,
        fmtPct:              fmtPct,

        // Palette constants
        PALETTE_CATEGORICAL: PALETTE_CATEGORICAL,
        PALETTE_BLUE:        PALETTE_BLUE,
        PALETTE_DIVERGE:     PALETTE_DIVERGE,
        PALETTE_STATUS:      PALETTE_STATUS,
    };

}(window));
