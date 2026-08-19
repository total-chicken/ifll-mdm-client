# IFLL MDM Client

Login + data-fetch client for the Genus URJA+ Meter Data Management portal
(`https://mdm.genusdvvnl.in`), used by DVVNL.

## How the portal's login works

The portal is an Angular SPA that authenticates through Keycloak (OIDC):

- Realm: `genuspower`
- Client: `mdm-ui`
- Token endpoint: `https://mdm.genusdvvnl.in/realms/genuspower/protocol/openid-connect/token`
- Grant type: `password` (Resource Owner Password Credentials), **plus a
  `totp` field** — this account has MFA enforced, so every login needs a
  fresh 6-digit code from the authenticator app. There is no stored TOTP
  seed, so this cannot run fully unattended; an operator must supply the
  current code each time the session needs to be (re-)established.
- A successful login also returns a `refresh_token` (long-lived, via the
  `offline_access` scope), which can renew the access token without a new
  OTP until the refresh token itself expires.

## Setup

```
npm install
cp .env.example .env
# fill in MDM_USERNAME and MDM_PASSWORD in .env
npm run login          # prompts for the current TOTP code
npm start               # example authenticated API call
```

`npm run login` can also take the OTP as an argument: `npm run login -- 123456`.

Tokens are cached in `.token-cache.json` (gitignored, never commit it).
API calls in `src/api/client.js` auto-refresh the access token from the
cached refresh token when it's expired; once the refresh token itself
expires, run `npm run login` again with a new OTP.

## Data endpoints

`src/api/client.js` exposes `mdmFetch(path, options)` against the API base
`MDM_API_BASE` (default `/urjaservice`). Add specific read endpoints here
once their headers/payload/response shapes are provided.

## Apps Script edition (recommended over the static Pages build)

`apps-script/` is the same dashboard as a Google Apps Script web app —
runs from a URL, not `localhost`, but keeps the live MDM session
server-side (Script Properties + `UrlFetchApp`) instead of in public
client-side JS. Deployment access defaults to "Only myself". See
`apps-script/README.md` for the URL and details.

## Line-loss dashboard (local, Node/Express)

```
npm run dashboard        # http://localhost:5050
```

Shows the three feeder-report sheets from the source line-loss workbook
(JHANSI INDEPENDENT, JHANSI MAU INDUSTRIAL, MAURANIPUR INDEPENDENT) as
tabs, with table columns matching each sheet's own headers exactly. Each
row is classified good/warning/critical/pending-data/error from its line
loss reading, with stat tiles, a top-offenders view, search, and filters.

`server/index.js` currently reads the seeded snapshot in `data/*.json`.
Once the MDM read-endpoint shapes are known, replace that file read with
an `mdmFetch()` call plus a mapper that outputs rows keyed by the same
headers — `src/lineloss/config.js` defines the schema and status logic,
and nothing in the UI needs to change.
