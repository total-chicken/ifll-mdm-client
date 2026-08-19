// ============================================================
//  CONFIG
// ============================================================

const MDM_HOST = 'https://mdm.genusdvvnl.in';
const MDM_REALM = 'genuspower';
const MDM_CLIENT_ID = 'mdm-ui';
const MDM_SCOPE = 'openid profile email roles offline_access mdm-api-scope prepay-api-scope vee-api-scope eaa-api-scope assetmanagement-api-scope';
const MDM_API_BASE = '/urjaservice';

const SHEETS = [
  {
    id: 'jhansi-independent',
    label: 'JHANSI INDEPENDENT',
    rows: JHANSI_INDEPENDENT_ROWS,
    lineLossKey: 'LINE LOSS (1-13-14)*100',
    energySoldKey: 'ENERGY SOLD',
    inputEnergyKey: 'ENERGY CONSUMED (MWH)',
  },
  {
    id: 'jhansi-mau-industrial',
    label: 'JHANSI MAU INDUSTRIAL',
    rows: JHANSI_MAU_INDUSTRIAL_ROWS,
    lineLossKey: 'Line Loss(%)',
    energySoldKey: 'Sold Energy (MWH)',
    inputEnergyKey: 'Input Energy (MWH)',
  },
  {
    id: 'mauranipur-independent',
    label: 'MAURANIPUR INDEPENDENT',
    rows: MAURANIPUR_INDEPENDENT_ROWS,
    lineLossKey: 'LINE LOSS (1-13-14)*100',
    energySoldKey: 'ENERGY SOLD',
    inputEnergyKey: 'ENERGY CONSUMED (MWH)',
  },
];

// ============================================================
//  WEB APP ENTRY POINT
// ============================================================

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Line Loss Dashboard - DVVNL')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ============================================================
//  LINE LOSS REPORT (static sample data - see Data.js)
// ============================================================

function classifyRow_(row, sheetCfg) {
  const rawLoss = String(row[sheetCfg.lineLossKey] || '').trim();
  const rawSold = String(row[sheetCfg.energySoldKey] || '').trim();

  if (/#DIV|ERROR|N\/A/i.test(rawLoss)) return { status: 'error', value: null };
  if (!rawLoss) return { status: 'pending', value: null };

  const numeric = parseFloat(rawLoss.replace('%', ''));
  if (isNaN(numeric)) return { status: 'error', value: null };
  if (!rawSold && numeric === 100) return { status: 'pending', value: numeric };
  if (numeric < 0) return { status: 'critical', value: numeric };
  if (numeric <= 15) return { status: 'good', value: numeric };
  if (numeric <= 25) return { status: 'warning', value: numeric };
  return { status: 'critical', value: numeric };
}

function parseNumeric_(value) {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).replace('%', '').trim();
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function buildSheetPayload_(sheetCfg) {
  const rows = sheetCfg.rows;
  const headers = rows.length ? Object.keys(rows[0]) : [];

  const enrichedRows = rows.map(function (row) {
    const c = classifyRow_(row, sheetCfg);
    return { cells: row, status: c.status, lossValue: c.value };
  });

  const numericLosses = enrichedRows
    .filter(function (r) { return r.status === 'good' || r.status === 'warning' || r.status === 'critical'; })
    .map(function (r) { return r.lossValue; });

  const totalInput = rows.reduce(function (sum, r) { return sum + (parseNumeric_(r[sheetCfg.inputEnergyKey]) || 0); }, 0);
  const totalSold = rows.reduce(function (sum, r) { return sum + (parseNumeric_(r[sheetCfg.energySoldKey]) || 0); }, 0);
  const flaggedCount = enrichedRows.filter(function (r) { return r.status === 'warning' || r.status === 'critical'; }).length;
  const avgLoss = numericLosses.length
    ? numericLosses.reduce(function (a, b) { return a + b; }, 0) / numericLosses.length
    : null;

  return {
    id: sheetCfg.id,
    label: sheetCfg.label,
    headers: headers,
    rows: enrichedRows,
    summary: {
      feederCount: rows.length,
      totalInputMWH: totalInput,
      totalSoldMWH: totalSold,
      avgLossPercent: avgLoss,
      flaggedCount: flaggedCount,
    },
  };
}

/** Client-callable: returns all three report sheets. */
function getLineLossPayload() {
  return {
    sheets: SHEETS.map(buildSheetPayload_),
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================
//  MDM SESSION (Keycloak password + TOTP grant)
//  Tokens live in Script Properties: only script editors can see
//  them, never exposed to the web app's client-side JS.
// ============================================================

function tokenUrl_() {
  return MDM_HOST + '/realms/' + MDM_REALM + '/protocol/openid-connect/token';
}

function requestToken_(params) {
  const payload = Object.assign({ client_id: MDM_CLIENT_ID, scope: MDM_SCOPE }, params);
  const body = Object.keys(payload).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(payload[k]);
  }).join('&');

  const res = UrlFetchApp.fetch(tokenUrl_(), {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: body,
    muteHttpExceptions: true,
  });

  const status = res.getResponseCode();
  const text = res.getContentText();
  let data;
  try { data = JSON.parse(text); } catch (e) {
    throw new Error('Keycloak returned a non-JSON response (HTTP ' + status + ')');
  }
  if (status !== 200) {
    throw new Error(data.error_description || data.error || ('Login failed (HTTP ' + status + ')'));
  }
  return data;
}

function saveTokens_(tokenResponse) {
  const props = PropertiesService.getScriptProperties();
  const now = Date.now();
  props.setProperties({
    MDM_ACCESS_TOKEN: tokenResponse.access_token,
    MDM_REFRESH_TOKEN: tokenResponse.refresh_token || '',
    MDM_EXPIRES_AT: String(now + tokenResponse.expires_in * 1000),
    MDM_REFRESH_EXPIRES_AT: tokenResponse.refresh_expires_in ? String(now + tokenResponse.refresh_expires_in * 1000) : '',
  });
}

/** Client-callable: log in with password + fresh TOTP code. */
function loginToMdm(username, password, otp) {
  if (!username || !password || !otp) {
    throw new Error('Username, password and OTP are all required.');
  }
  const tokens = requestToken_({
    grant_type: 'password',
    username: username,
    password: password,
    totp: String(otp).replace(/\s+/g, ''),
  });
  saveTokens_(tokens);

  // Remember username for convenience (never the password).
  PropertiesService.getScriptProperties().setProperty('MDM_USERNAME', username);

  return getSessionStatus();
}

/** Client-callable: current login state, for the UI to render. */
function getSessionStatus() {
  const props = PropertiesService.getScriptProperties();
  const expiresAt = props.getProperty('MDM_EXPIRES_AT');
  const refreshExpiresAt = props.getProperty('MDM_REFRESH_EXPIRES_AT');
  return {
    loggedIn: !!expiresAt,
    username: props.getProperty('MDM_USERNAME') || '',
    expiresAt: expiresAt ? new Date(Number(expiresAt)).toISOString() : null,
    refreshExpired: !!(refreshExpiresAt && Date.now() >= Number(refreshExpiresAt)),
    hasRefreshToken: !!props.getProperty('MDM_REFRESH_TOKEN'),
  };
}

/** Internal: returns a valid access token, refreshing silently if possible. */
function getValidAccessToken_() {
  const props = PropertiesService.getScriptProperties();
  const accessToken = props.getProperty('MDM_ACCESS_TOKEN');
  const expiresAt = Number(props.getProperty('MDM_EXPIRES_AT') || 0);

  if (!accessToken) {
    throw new Error('Not logged in. Log in with your MDM username, password and a fresh OTP first.');
  }

  if (Date.now() < expiresAt - 30000) {
    return accessToken;
  }

  const refreshToken = props.getProperty('MDM_REFRESH_TOKEN');
  const refreshExpiresAt = props.getProperty('MDM_REFRESH_EXPIRES_AT');
  const refreshExpired = refreshExpiresAt && Date.now() >= Number(refreshExpiresAt);
  if (!refreshToken || refreshExpired) {
    throw new Error('Session expired. Log in again with a fresh OTP.');
  }

  const tokens = requestToken_({ grant_type: 'refresh_token', refresh_token: refreshToken });
  saveTokens_(tokens);
  return tokens.access_token;
}

// ============================================================
//  METER REGISTER (dynamic add/edit/delete/fetch)
// ============================================================

function getMeterRegistry_() {
  const raw = PropertiesService.getScriptProperties().getProperty('METER_REGISTRY');
  return raw ? JSON.parse(raw) : [];
}

function saveMeterRegistry_(list) {
  PropertiesService.getScriptProperties().setProperty('METER_REGISTRY', JSON.stringify(list));
  return list;
}

/** Client-callable */
function getMeterRegistry() {
  return getMeterRegistry_();
}

/** Client-callable */
function addMeter(meterId, label) {
  if (!meterId || !String(meterId).trim()) throw new Error('meterId is required');
  const list = getMeterRegistry_();
  if (list.some(function (m) { return m.meterId === meterId; })) {
    throw new Error('Meter ' + meterId + ' is already tracked');
  }
  list.push({
    meterId: String(meterId).trim(),
    label: label ? String(label).trim() : '',
    addedAt: new Date().toISOString(),
    lastFetchedAt: null,
    lastResult: null,
    lastError: null,
  });
  return saveMeterRegistry_(list);
}

/** Client-callable */
function editMeter(meterId, newMeterId, label) {
  const list = getMeterRegistry_();
  const entry = list.find(function (m) { return m.meterId === meterId; });
  if (!entry) throw new Error('Meter not tracked');

  if (newMeterId && newMeterId !== entry.meterId) {
    if (list.some(function (m) { return m.meterId === newMeterId; })) {
      throw new Error('Meter ' + newMeterId + ' is already tracked');
    }
    entry.meterId = String(newMeterId).trim();
    entry.lastFetchedAt = null;
    entry.lastResult = null;
    entry.lastError = null;
  }
  if (label !== undefined && label !== null) entry.label = String(label).trim();

  return saveMeterRegistry_(list);
}

/** Client-callable */
function deleteMeter(meterId) {
  const list = getMeterRegistry_().filter(function (m) { return m.meterId !== meterId; });
  return saveMeterRegistry_(list);
}

/** Client-callable: live fetch of one meter's billing/register history. */
function fetchMeterData(meterId, year) {
  const list = getMeterRegistry_();
  const entry = list.find(function (m) { return m.meterId === meterId; });
  if (!entry) throw new Error('Meter not tracked');

  try {
    const token = getValidAccessToken_();
    const payload = {
      applyMF: true,
      consumerNo: '',
      meterId: meterId,
      pageNumber: 0,
      pageSize: 0,
      totalRecords: 0,
      year: year || new Date().getFullYear(),
    };
    const res = UrlFetchApp.fetch(MDM_HOST + MDM_API_BASE + '/api/v1/Meter/getCurrentBillDataHistory', {
      method: 'put',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    if (res.getResponseCode() !== 200) {
      throw new Error('MDM API returned HTTP ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
    }

    entry.lastResult = JSON.parse(res.getContentText());
    entry.lastFetchedAt = new Date().toISOString();
    entry.lastError = null;
  } catch (err) {
    entry.lastError = err.message;
  }

  saveMeterRegistry_(list);
  return entry;
}
