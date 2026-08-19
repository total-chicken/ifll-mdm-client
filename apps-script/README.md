# Line Loss Dashboard — Apps Script edition

Same dashboard as `public/` and `docs/`, rebuilt as a Google Apps Script web
app so it runs from a URL instead of `localhost`, while keeping the live MDM
session server-side (Google's infrastructure), never in the page's
client-side JS.

**Container-bound to this Sheet:**
https://docs.google.com/spreadsheets/d/1BM6SNzlFHzyIY9lQfNpZyV58AkEEmFSKo92d-9Z2W14/edit

**Live URL:** https://script.google.com/macros/s/AKfycbzeuNS5_h0_ZQtgr750ocouA6M4Bp2ALGpn28SstEObQ_9x0RmOylEneCEulRj1objx/exec

Owning account: `atif.siddiqui@uppcl.org` (deployed from this account; a
prior standalone version deployed under `atif.hunk@gmail.com` was undeployed
and removed).

## Why this is safe to run from a public URL

- Deployment access is set to **"Only myself"** (`appsscript.json` →
  `webapp.access: MYSELF`) — only the Google account that deployed it can
  open the page at all. Change this in Apps Script → Deploy → Manage
  deployments if you want to share it with specific teammates (switch to a
  Google Workspace domain, or list individual accounts).
- The MDM username/password/tokens live in `PropertiesService` (Script
  Properties) — a server-side store visible only to people with edit access
  to the script project, never sent to the browser.
- Every MDM API call (`UrlFetchApp`) happens server-side in Code.js. There is
  no client-side fetch to `mdm.genusdvvnl.in`, so there's no CORS problem to
  work around and no token ever reaches the page's JavaScript.
- MFA (TOTP) still applies: logging in (or re-logging in once the refresh
  token expires) needs a human to type the current 6-digit code into the
  page. This can't be automated away — it's the MDM portal's own MFA policy,
  not a limitation of this app.

## Structure

- `appsscript.json` — manifest (web app access mode, timezone)
- `Code.js` — server: Keycloak login/refresh, line-loss report shaping,
  meter register CRUD + live fetch
- `Data.js` — auto-generated static snapshot of the source line-loss
  workbook (regenerate with the Node script noted at the top of the file)
- `Index.html` / `Stylesheet.html` / `JavaScript.html` — the page (Apps
  Script splits HTML/CSS/JS into separate files, included via templating)

## Deploying changes

```
cd apps-script
clasp push          # push local file edits to the script project
clasp deploy         # publish a new version at the same URL
```

`clasp deployments` lists existing deployments; `clasp open-script` opens
the script editor in a browser.
