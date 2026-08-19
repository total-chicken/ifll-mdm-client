// Sheet definitions mirror the three tabs of the source line-loss workbook
// ("line loss JULY 2026.xlsx") exactly — same tab names, same column headers.
// `dataFile` currently points at a static JSON snapshot pulled from that
// workbook; once the MDM read endpoints are known, replace the read in
// server/index.js with an MDM fetch + a mapper that produces objects with
// these exact same keys, and nothing else in this file or the UI needs to change.
export const SHEETS = [
  {
    id: 'jhansi-independent',
    label: 'JHANSI INDEPENDENT',
    dataFile: 'jhansi-independent.json',
    lineLossKey: 'LINE LOSS (1-13-14)*100',
    energySoldKey: 'ENERGY SOLD',
    inputEnergyKey: 'ENERGY CONSUMED (MWH)',
    percentSuffixed: false,
  },
  {
    id: 'jhansi-mau-industrial',
    label: 'JHANSI MAU INDUSTRIAL',
    dataFile: 'jhansi-mau-industrial.json',
    lineLossKey: 'Line Loss(%)',
    energySoldKey: 'Sold Energy (MWH)',
    inputEnergyKey: 'Input Energy (MWH)',
    percentSuffixed: true,
  },
  {
    id: 'mauranipur-independent',
    label: 'MAURANIPUR INDEPENDENT',
    dataFile: 'mauranipur-independent.json',
    lineLossKey: 'LINE LOSS (1-13-14)*100',
    energySoldKey: 'ENERGY SOLD',
    inputEnergyKey: 'ENERGY CONSUMED (MWH)',
    percentSuffixed: false,
  },
];

/**
 * Classifies a row's line-loss reading into a status:
 *  - "pending": no sold-energy figure has come in yet (reads as a false 100% loss)
 *  - "error":   the source sheet has a formula error (e.g. #DIV/0!, meter/CT fault)
 *  - "good" / "warning" / "critical": thresholds on the numeric loss %
 * Negative % (sold > consumed) always means a metering/data problem, not real gain.
 */
export function classifyRow(row, sheetCfg) {
  const rawLoss = String(row[sheetCfg.lineLossKey] ?? '').trim();
  const rawSold = String(row[sheetCfg.energySoldKey] ?? '').trim();

  if (/#DIV|ERROR|N\/A/i.test(rawLoss)) {
    return { status: 'error', value: null };
  }
  if (!rawLoss) {
    return { status: 'pending', value: null };
  }

  const numeric = parseFloat(rawLoss.replace('%', ''));
  if (Number.isNaN(numeric)) {
    return { status: 'error', value: null };
  }
  if (!rawSold && numeric === 100) {
    return { status: 'pending', value: numeric };
  }
  if (numeric < 0) {
    return { status: 'critical', value: numeric };
  }
  if (numeric <= 15) {
    return { status: 'good', value: numeric };
  }
  if (numeric <= 25) {
    return { status: 'warning', value: numeric };
  }
  return { status: 'critical', value: numeric };
}

export function parseNumeric(value) {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).replace('%', '').trim();
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
}
