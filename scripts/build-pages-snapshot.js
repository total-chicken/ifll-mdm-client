// Refreshes the public GitHub Pages copy of the meter register from the
// local (live-fetched) data/meter-registry.json. Run this after adding
// meters or fetching fresh data locally, then commit + push docs/ to
// publish the update. Pages is static-only, so this snapshot is the only
// way the public site's meter register tab reflects your local fetches.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const src = path.join(ROOT, 'data', 'meter-registry.json');
const dest = path.join(ROOT, 'docs', 'data', 'meter-registry.json');

const raw = readFileSync(src, 'utf8').replace(/^﻿/, '');
const registry = JSON.parse(raw);

writeFileSync(dest, JSON.stringify(registry, null, 2), 'utf8');
console.log(`Snapshotted ${registry.length} meter(s) to docs/data/meter-registry.json`);
console.log('Now commit + push docs/ to publish the update to GitHub Pages.');
