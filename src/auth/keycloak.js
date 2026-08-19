import 'dotenv/config';

const HOST = process.env.MDM_HOST || 'https://mdm.genusdvvnl.in';
const REALM = process.env.MDM_REALM || 'genuspower';
const CLIENT_ID = process.env.MDM_CLIENT_ID || 'mdm-ui';
const SCOPE = 'openid profile email roles offline_access mdm-api-scope prepay-api-scope vee-api-scope eaa-api-scope assetmanagement-api-scope';

const TOKEN_URL = `${HOST}/realms/${REALM}/protocol/openid-connect/token`;

async function requestToken(params) {
  const body = new URLSearchParams({ client_id: CLIENT_ID, scope: SCOPE, ...params });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Keycloak returned non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error(data.error_description || data.error || `Login failed (HTTP ${res.status})`);
  }

  return data;
}

/**
 * Password + TOTP direct grant. This account has MFA enforced, so a fresh
 * 6-digit code is required on every login (no stored TOTP seed).
 */
export function loginWithPassword({ username, password, totp }) {
  if (!username || !password || !totp) {
    throw new Error('username, password and totp are all required');
  }
  return requestToken({
    grant_type: 'password',
    username,
    password,
    totp: String(totp).replace(/\s+/g, ''),
  });
}

/** Exchange a still-valid refresh_token for a new access_token (no OTP needed). */
export function refreshAccessToken(refreshToken) {
  if (!refreshToken) throw new Error('refreshToken is required');
  return requestToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}
