import 'dotenv/config';
import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SHEETS, classifyRow, parseNumeric } from '../src/lineloss/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const PORT = process.env.PORT || 5050;

const app = express();
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

app.listen(PORT, () => {
  console.log(`IFLL MDM dashboard running at http://localhost:${PORT}`);
});
