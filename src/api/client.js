import 'dotenv/config';
import { loadTokens, isExpired, saveTokens } from '../auth/tokenStore.js';
import { refreshAccessToken } from '../auth/keycloak.js';

const HOST = process.env.MDM_HOST || 'https://mdm.genusdvvnl.in';
const API_BASE = process.env.MDM_API_BASE || '/urjaservice';

/** Returns a valid access token, silently refreshing it if it's expired. */
async function getValidAccessToken() {
  let tokens = loadTokens();
  if (!tokens) {
    throw new Error('No saved session. Run `npm run login` first.');
  }

  if (isExpired(tokens)) {
    const refreshExpired = tokens.refresh_expires_at && Date.now() >= new Date(tokens.refresh_expires_at).getTime();
    if (!tokens.refresh_token || refreshExpired) {
      throw new Error('Session and refresh token both expired. Run `npm run login` again with a fresh OTP.');
    }
    const fresh = await refreshAccessToken(tokens.refresh_token);
    tokens = saveTokens(fresh);
  }

  return tokens.access_token;
}

/**
 * Authenticated fetch against the MDM API (base: MDM_API_BASE, e.g. /urjaservice).
 * `path` should start with '/', e.g. client('/meters/search', { method: 'POST', body: {...} }).
 */
export async function mdmFetch(path, { method = 'GET', body, headers = {} } = {}) {
  const token = await getValidAccessToken();

  const res = await fetch(`${HOST}${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(`MDM API ${method} ${path} failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }

  return data;
}
