// Bundles scripts/smoke.ts with esbuild (already a Vite dependency — no new
// packages) and runs it under Node. Usage: node scripts/run-smoke.mjs
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outdir = mkdtempSync(join(tmpdir(), 'smoke-'));

await build({
  entryPoints: [join(root, 'scripts', 'smoke.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: join(outdir, 'smoke.mjs'),
  logLevel: 'warning',
});

const res = spawnSync(process.execPath, [join(outdir, 'smoke.mjs')], {
  stdio: 'inherit',
  cwd: root,
});
process.exit(res.status ?? 1);
