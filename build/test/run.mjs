#!/usr/bin/env node
// Runs the browser tests against a server this script owns, so the tests never
// depend on a server someone started earlier and that may have died.
//   node build/test/run.mjs            all
//   node build/test/run.mjs e2e scroll  just those
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 8099;
const ALL = ['e2e', 'scroll', 'layout', 'blockers', 'listen', 'produce', 'drill', 'tracks', 'grammar-ui',
  'swipe', 'fixes', 'offline', 'offline-level', 'update', 'upgrade'];
const want = process.argv.slice(2).length ? process.argv.slice(2) : ALL;

const server = spawn(process.execPath, [path.join(ROOT, 'serve.mjs'), String(PORT)], { cwd: ROOT, stdio: 'ignore' });
const bye = () => { try { server.kill(); } catch { /* already gone */ } };
process.on('exit', bye); process.on('SIGINT', () => { bye(); process.exit(1); });

// wait for it to answer
for (let i = 0; i < 40; i++) {
  try { const r = await fetch(`http://localhost:${PORT}/`); if (r.ok) break; } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 250));
}

let failed = 0;
for (const name of want) {
  const file = path.join(ROOT, 'build', 'test', `${name}.mjs`);
  const out = await new Promise((res) => {
    const p = spawn(process.execPath, [file], { cwd: ROOT, env: { ...process.env, NIHONGO_BASE: `http://localhost:${PORT}` } });
    let buf = '';
    p.stdout.on('data', (d) => { buf += d; });
    p.stderr.on('data', (d) => { buf += d; });
    p.on('close', (code) => res({ code, buf }));
  });
  const verdict = out.buf.match(/=== .*(PASS|FAIL).*===|total error lines: \d+/g)?.pop()
    || (out.code === 0 ? 'completed' : `exit ${out.code}`);
  const bad = /FAIL/.test(verdict) || /total error lines: [1-9]/.test(verdict) || out.code !== 0;
  if (bad) { failed++; console.log(`\n--- ${name} ---\n${out.buf.trim().split('\n').slice(-25).join('\n')}`); }
  console.log(`${bad ? 'FAIL' : 'ok  '}  ${name.padEnd(14)} ${verdict}`);
}
bye();
console.log(`\n${failed === 0 ? 'ALL TESTS PASS' : `${failed} SUITE(S) FAILED`}`);
process.exit(failed ? 1 : 0);
