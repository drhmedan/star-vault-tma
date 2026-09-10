// ============================================================
// TiDB migration — replay the JSONL journal into TiDB.
// ============================================================
// One-time (and re-runnable) transition: reads the ledger journal, assigns
// a sequence to every entry, applies each one idempotently into TiDB, and
// records the watermark. Run from a machine with the database configured:
//
//   DATABASE_URL="mysql://user:pass@host:4000/db?sslMode=VERIFY_IDENTITY" \
//     node server/migrate.mjs
//
// (Or set TIDB_HOST/TIDB_PORT/TIDB_USER/TIDB_PASSWORD/TIDB_NAME/TIDB_SSL_CA.)
// The server itself never needs this — it backfills automatically on boot —
// this script exists to bootstrap an existing journal into a fresh cluster.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import { connectTiDB, applyEntry, setMeta } from './tidb.mjs';

const dataFile = process.env.LEDGER_FILE || path.join(process.cwd(), 'data', 'ledger.jsonl');

const pool = await connectTiDB();
if (!pool) {
  console.error('TiDB unreachable — set DATABASE_URL (see DEPLOY.md).');
  process.exit(1);
}

let raw = '';
try { raw = fs.readFileSync(dataFile, 'utf8'); } catch { raw = ''; }
const lines = raw.split('\n').filter((l) => l.trim());

let seq = 0;
for (const line of lines) {
  let entry;
  try { entry = JSON.parse(line); } catch { continue; }
  entry.seq = ++seq;
  await applyEntry(pool, entry);
}

await setMeta(pool, 'last_seq', String(seq));
console.log(`Migrated ${seq} journal entries into TiDB (watermark = ${seq}).`);
await pool.end();
