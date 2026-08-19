import 'dotenv/config';
import express from 'express';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SHEETS, classifyRow, parseNumeric } from '../src/lineloss/config.js';
import { getCurrentBillDataHistory } from '../src/api/meter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const REGISTRY_PATH = path.join(DATA_DIR, 'meter-registry.json');
const PORT = process.env.PORT || 5050;

const app = express();
app.use(express.json());
app.use(express.static(path.join(ROOT, 'public')));

// TODO: once the MDM read-data endpoints (headers/payload/response) are
// provided, replace this file read with an mdmFetch() call plus a mapper
// that returns rows keyed by the exact same headers as SHEETS[i].dataFile.
function loadSheetRows(sheetCfg) {
  const raw = readFileSync(path.join(DATA_DIR, sheetCfg.dataFile), 'utf8').replace(/^﻿/, '');
  return JSON.parse(raw);
}

function buildSheetPayload(sheetCfg) {
  const rows = loadSheetRows(sheetCfg);
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

app.get('/api/line-loss', (req, res) => {
  try {
    const sheets = SHEETS.map(buildSheetPayload);
    res.json({ sheets, source: 'sample-xlsx', generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Meter register: user-managed list of meters to pull live billing
// history for. This is the "dynamic" side; docs/data/meter-registry.json
// is a static snapshot of this file, refreshed via `npm run pages:snapshot`.

function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) return [];
  const raw = readFileSync(REGISTRY_PATH, 'utf8').replace(/^﻿/, '');
  return raw.trim() ? JSON.parse(raw) : [];
}

function saveRegistry(list) {
  writeFileSync(REGISTRY_PATH, JSON.stringify(list, null, 2), 'utf8');
  return list;
}

app.get('/api/meters', (req, res) => {
  res.json(loadRegistry());
});

app.post('/api/meters', (req, res) => {
  const { meterId, label } = req.body || {};
  if (!meterId || !String(meterId).trim()) {
    return res.status(400).json({ error: 'meterId is required' });
  }
  const list = loadRegistry();
  if (list.some((m) => m.meterId === meterId)) {
    return res.status(409).json({ error: `Meter ${meterId} is already tracked` });
  }
  list.push({
    meterId: String(meterId).trim(),
    label: label ? String(label).trim() : '',
    addedAt: new Date().toISOString(),
    lastFetchedAt: null,
    lastResult: null,
    lastError: null,
  });
  res.json(saveRegistry(list));
});

app.put('/api/meters/:meterId', (req, res) => {
  const list = loadRegistry();
  const entry = list.find((m) => m.meterId === req.params.meterId);
  if (!entry) return res.status(404).json({ error: 'Meter not tracked' });

  const { newMeterId, label } = req.body || {};
  if (newMeterId && newMeterId !== entry.meterId) {
    if (list.some((m) => m.meterId === newMeterId)) {
      return res.status(409).json({ error: `Meter ${newMeterId} is already tracked` });
    }
    entry.meterId = String(newMeterId).trim();
    entry.lastFetchedAt = null;
    entry.lastResult = null;
    entry.lastError = null;
  }
  if (label !== undefined) entry.label = String(label).trim();

  res.json(saveRegistry(list));
});

app.delete('/api/meters/:meterId', (req, res) => {
  const list = loadRegistry().filter((m) => m.meterId !== req.params.meterId);
  res.json(saveRegistry(list));
});

app.post('/api/meters/:meterId/fetch', async (req, res) => {
  const list = loadRegistry();
  const entry = list.find((m) => m.meterId === req.params.meterId);
  if (!entry) return res.status(404).json({ error: 'Meter not tracked' });

  try {
    const year = req.query.year ? Number(req.query.year) : undefined;
    entry.lastResult = await getCurrentBillDataHistory(entry.meterId, { year });
    entry.lastFetchedAt = new Date().toISOString();
    entry.lastError = null;
  } catch (err) {
    entry.lastError = err.message;
  }
  saveRegistry(list);
  res.json(entry);
});

app.listen(PORT, () => {
  console.log(`IFLL MDM dashboard running at http://localhost:${PORT}`);
});
