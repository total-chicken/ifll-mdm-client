import { SHEETS, classifyRow, parseNumeric } from './config.js';

const STATUS_META = {
  good: { icon: '✓', label: 'Good' },
  warning: { icon: '!', label: 'Warning' },
  critical: { icon: '✕', label: 'Critical' },
  pending: { icon: '…', label: 'Pending data' },
  error: { icon: '⚠', label: 'Error' },
};

const state = {
  sheets: [],
  activeSheetId: null,
  search: '',
  division: '',
  status: '',
  sortKey: null,
  sortDir: 1,
};

// --- Static data loading (this is the GitHub Pages mirror: no server, so
// the same row-shaping logic server/index.js does at request time runs
// here in the browser against the bundled data/*.json snapshot instead.) ---

async function loadSheetRows(sheetCfg) {
  const res = await fetch(`data/${sheetCfg.dataFile}`);
  const text = await res.text();
  return JSON.parse(text.replace(/^﻿/, ''));
}

async function buildSheetPayload(sheetCfg) {
  const rows = await loadSheetRows(sheetCfg);
  const headers = rows.length ? Object.keys(rows[0]) : [];

  const enrichedRows = rows.map((row) => {
    const { status, value } = classifyRow(row, sheetCfg);
    return { cells: row, status, lossValue: value };
  });

  const numericLosses = enrichedRows
    .filter((r) => r.status === 'good' || r.status === 'warning' || r.status === 'critical')
    .map((r) => r.lossValue);

  const totalInput = rows.reduce((sum, r) => sum + (parseNumeric(r[sheetCfg.inputEnergyKey]) || 0), 0);
  const totalSold = rows.reduce((sum, r) => sum + (parseNumeric(r[sheetCfg.energySoldKey]) || 0), 0);
  const flaggedCount = enrichedRows.filter((r) => r.status === 'warning' || r.status === 'critical').length;
  const avgLoss = numericLosses.length
    ? numericLosses.reduce((a, b) => a + b, 0) / numericLosses.length
    : null;

  return {
    id: sheetCfg.id,
    label: sheetCfg.label,
    headers,
    lineLossKey: sheetCfg.lineLossKey,
    rows: enrichedRows,
    summary: {
      feederCount: rows.length,
      totalInputMWH: totalInput,
      totalSoldMWH: totalSold,
      avgLossPercent: avgLoss,
      flaggedCount,
    },
  };
}

async function loadAllSheets() {
  const sheets = await Promise.all(SHEETS.map(buildSheetPayload));
  return { sheets, source: 'sample-xlsx (static GitHub Pages build)', generatedAt: new Date().toISOString() };
}

// --- UI (identical to the server-backed version in public/app.js) ---

function applyStoredTheme() {
  const stored = localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light') {
    document.documentElement.setAttribute('data-theme', stored);
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = current ? current === 'dark' : prefersDark;
  const next = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
}

function activeSheet() {
  return state.sheets.find((s) => s.id === state.activeSheetId);
}

function formatNumber(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function renderTabs() {
  const tabs = document.getElementById('tabs');
  tabs.innerHTML = '';
  state.sheets.forEach((sheet) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (sheet.id === state.activeSheetId ? ' active' : '');
    btn.textContent = sheet.label;
    btn.setAttribute('role', 'tab');
    btn.addEventListener('click', () => {
      state.activeSheetId = sheet.id;
      state.search = '';
      state.division = '';
      state.status = '';
      state.sortKey = null;
      document.getElementById('searchBox').value = '';
      render();
    });
    tabs.appendChild(btn);
  });
}

function renderStats() {
  const sheet = activeSheet();
  const row = document.getElementById('statRow');
  if (!sheet) { row.innerHTML = ''; return; }
  const { summary } = sheet;

  const tiles = [
    { label: 'Feeders', value: summary.feederCount, cls: '' },
    { label: 'Total input energy (MWH)', value: formatNumber(summary.totalInputMWH), cls: '' },
    { label: 'Total sold energy (MWH)', value: formatNumber(summary.totalSoldMWH), cls: '' },
    {
      label: 'Avg line loss (numeric rows)',
      value: summary.avgLossPercent === null ? '—' : formatNumber(summary.avgLossPercent) + '%',
      cls: summary.avgLossPercent === null ? '' : summary.avgLossPercent <= 15 ? 'status-good' : summary.avgLossPercent <= 25 ? 'status-warning' : 'status-critical',
    },
    {
      label: 'Flagged (warning + critical)',
      value: summary.flaggedCount,
      cls: summary.flaggedCount > 0 ? 'status-critical' : 'status-good',
    },
  ];

  row.innerHTML = tiles.map((t) => `
    <div class="stat-tile">
      <div class="stat-label">${t.label}</div>
      <div class="stat-value ${t.cls}">${t.value}</div>
    </div>
  `).join('');
}

function feederNameFor(sheet, cells) {
  return cells['FEEDER NAME'] || cells['Industrial Feeder Name'] || cells['FEEDER CODE'] || '—';
}

function renderMeterList() {
  const sheet = activeSheet();
  const container = document.getElementById('meterList');
  if (!sheet) { container.innerHTML = ''; return; }

  const ranked = sheet.rows
    .filter((r) => r.status !== 'pending' && r.status !== 'error' && r.lossValue !== null)
    .slice()
    .sort((a, b) => Math.abs(b.lossValue) - Math.abs(a.lossValue))
    .slice(0, 5);

  if (!ranked.length) {
    container.innerHTML = '<p class="stat-label">No numeric line-loss readings in this sheet.</p>';
    return;
  }

  const maxAbs = Math.max(...ranked.map((r) => Math.abs(r.lossValue)), 1);

  container.innerHTML = ranked.map((r) => {
    const pct = Math.min(100, (Math.abs(r.lossValue) / maxAbs) * 100);
    const color = `var(--status-${r.status})`;
    return `
      <div class="meter-row">
        <div class="meter-name" title="${feederNameFor(sheet, r.cells)}">${feederNameFor(sheet, r.cells)}</div>
        <div class="meter-track"><div class="meter-fill" style="width:${pct}%;background:${color}"></div></div>
        <div class="meter-value">${formatNumber(r.lossValue)}%</div>
      </div>
    `;
  }).join('');
}

function populateDivisionFilter() {
  const sheet = activeSheet();
  const select = document.getElementById('divisionFilter');
  const divisionKey = sheet.headers.find((h) => /division/i.test(h));
  select.innerHTML = '<option value="">All divisions</option>';
  if (!divisionKey) { select.disabled = true; return; }
  select.disabled = false;
  const divisions = [...new Set(sheet.rows.map((r) => r.cells[divisionKey]).filter(Boolean))].sort();
  divisions.forEach((d) => {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    select.appendChild(opt);
  });
}

function filteredSortedRows(sheet) {
  const divisionKey = sheet.headers.find((h) => /division/i.test(h));
  let rows = sheet.rows;

  if (state.status) rows = rows.filter((r) => r.status === state.status);
  if (state.division && divisionKey) rows = rows.filter((r) => r.cells[divisionKey] === state.division);
  if (state.search) {
    const q = state.search.toLowerCase();
    rows = rows.filter((r) => Object.values(r.cells).some((v) => String(v ?? '').toLowerCase().includes(q)));
  }

  if (state.sortKey) {
    rows = rows.slice().sort((a, b) => {
      const av = a.cells[state.sortKey] ?? '';
      const bv = b.cells[state.sortKey] ?? '';
      const an = parseFloat(String(av).replace('%', ''));
      const bn = parseFloat(String(bv).replace('%', ''));
      let cmp;
      if (!Number.isNaN(an) && !Number.isNaN(bn)) cmp = an - bn;
      else cmp = String(av).localeCompare(String(bv));
      return cmp * state.sortDir;
    });
  }

  return rows;
}

function renderTable() {
  const sheet = activeSheet();
  const head = document.getElementById('tableHead');
  const body = document.getElementById('tableBody');
  if (!sheet) { head.innerHTML = ''; body.innerHTML = ''; return; }

  const wideCols = new Set(['REMARKS', 'ACCOUNT ID AND REMARKS', 'Reason for High loss (If Any)']);

  head.innerHTML = '<tr>' +
    '<th data-key="__status">Status</th>' +
    sheet.headers.map((h) => `<th data-key="${h}">${h}</th>`).join('') +
    '</tr>';

  head.querySelectorAll('th[data-key]').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (key === '__status') return;
      if (state.sortKey === key) state.sortDir *= -1;
      else { state.sortKey = key; state.sortDir = 1; }
      render();
    });
  });

  const rows = filteredSortedRows(sheet);
  document.getElementById('rowCount').textContent = `${rows.length} of ${sheet.rows.length} feeders`;

  body.innerHTML = rows.map((r) => {
    const meta = STATUS_META[r.status];
    const cells = sheet.headers.map((h) => {
      const wrap = wideCols.has(h) ? ' wrap' : '';
      return `<td class="${wrap}">${r.cells[h] || (r.cells[h] === 0 ? '0' : '—')}</td>`;
    }).join('');
    return `<tr>
      <td><span class="status-badge status-${r.status}">${meta.icon} ${meta.label}</span></td>
      ${cells}
    </tr>`;
  }).join('');
}

function renderBadge() {
  document.getElementById('sourceBadge').textContent = 'sample xlsx data — static GitHub Pages build, MDM endpoint not yet wired';
}

function render() {
  renderTabs();
  renderStats();
  renderMeterList();
  populateDivisionFilter();
  renderTable();
}

async function init() {
  applyStoredTheme();
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('searchBox').addEventListener('input', (e) => { state.search = e.target.value; renderTable(); });
  document.getElementById('divisionFilter').addEventListener('change', (e) => { state.division = e.target.value; renderTable(); });
  document.getElementById('statusChips').addEventListener('click', (e) => {
    if (!e.target.dataset.status && e.target.dataset.status !== '') return;
    state.status = e.target.dataset.status;
    document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    e.target.classList.add('active');
    renderTable();
  });
  document.querySelector('.chip[data-status=""]').classList.add('active');

  const data = await loadAllSheets();
  state.sheets = data.sheets;
  state.activeSheetId = data.sheets[0]?.id;
  renderBadge();
  document.getElementById('generatedAt').textContent = `Data generated: ${new Date(data.generatedAt).toLocaleString()}`;
  render();
}

init();
