import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loginWithPassword } from './keycloak.js';
import { saveTokens } from './tokenStore.js';

async function promptOtp() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const otp = await rl.question('Enter current 6-digit TOTP code: ');
  rl.close();
  return otp.trim();
}

async function main() {
  const username = process.env.MDM_USERNAME;
  const password = process.env.MDM_PASSWORD;

  if (!username || !password) {
    console.error('Set MDM_USERNAME and MDM_PASSWORD in .env first (see .env.example).');
    process.exit(1);
  }

  const otp = process.argv[2] || (await promptOtp());

  const tokens = await loginWithPassword({ username, password, totp: otp });
  const record = saveTokens(tokens);

  console.log('Login successful.');
  console.log(`Access token expires at: ${record.expires_at}`);
  console.log(`Refresh token expires at: ${record.refresh_expires_at || '(no fixed expiry - offline token)'}`);
}

main().catch((err) => {
  console.error('Login failed:', err.message);
  process.exit(1);
});
