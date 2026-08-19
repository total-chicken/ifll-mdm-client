import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.join(__dirname, '..', '..', '.token-cache.json');

export function saveTokens(tokenResponse) {
  // Keycloak offline tokens (issued via the offline_access scope) report
  // refresh_expires_in: 0, meaning "no fixed expiry" rather than "already
  // expired" — they're governed by the realm's offline session max instead.
  const refreshExpiresAt = tokenResponse.refresh_expires_in
    ? new Date(Date.now() + tokenResponse.refresh_expires_in * 1000).toISOString()
    : null;

  const record = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    token_type: tokenResponse.token_type,
    expires_at: new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString(),
    refresh_expires_at: refreshExpiresAt,
    saved_at: new Date().toISOString(),
  };
  writeFileSync(STORE_PATH, JSON.stringify(record, null, 2), 'utf8');
  return record;
}

export function loadTokens() {
  if (!existsSync(STORE_PATH)) return null;
  return JSON.parse(readFileSync(STORE_PATH, 'utf8'));
}

export function isExpired(record, skewSeconds = 30) {
  if (!record?.expires_at) return true;
  return Date.now() >= new Date(record.expires_at).getTime() - skewSeconds * 1000;
}
