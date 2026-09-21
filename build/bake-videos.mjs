#!/usr/bin/env node
// Bakes YouTube caption tracks into the app.
//
// Caption baseUrls are signed and expire in ~7 hours and are IP-bound, so the
// app can never fetch them at runtime - they must be baked here. The timedtext
// endpoint also rate-limits hard (a concurrency-8 run got 429 on 586/586 and the
// block outlasted 30 minutes), so this is deliberately SERIAL, slow, and
// resumable: re-run it as often as you like, it skips what it already has.
//
//   node build/bake-videos.mjs            # bake everything missing
//   node build/bake-videos.mjs --limit 20 # bake the next 20 only
//   node build/bake-videos.mjs --level N5
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSubs } from './lib/yt.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = path.join(ROOT, 'build', 'research', 'videos-verified.json');
const OUTDIR = path.join(ROOT, 'build', 'content', 'videos');
const FAILLOG = path.join(ROOT, 'build', 'content', 'videos-failed.json');

const arg = (name, def = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};

fs.mkdirSync(OUTDIR, { recursive: true });
const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const levelFilter = arg('level');
const limit = +arg('limit', 0) || Infinity;

const failed = fs.existsSync(FAILLOG) ? JSON.parse(fs.readFileSync(FAILLOG, 'utf8')) : {};

let todo = catalog.filter((v) => !fs.existsSync(path.join(OUTDIR, `${v.id}.json`)));
if (levelFilter) todo = todo.filter((v) => v.level === levelFilter.toUpperCase());
todo = todo.slice(0, limit);

const have = catalog.length - catalog.filter((v) => !fs.existsSync(path.join(OUTDIR, `${v.id}.json`))).length;
console.log(`catalog ${catalog.length} videos | already baked ${have} | baking ${todo.length} now\n`);

let ok = 0, bad = 0;
for (const [n, v] of todo.entries()) {
  const label = `[${n + 1}/${todo.length}] ${v.level} ${v.id} ${(v.title || '').slice(0, 44)}`;
  try {
    const r = await fetchSubs(v.id);
    if (!r.ok || !r.cues?.length) {
      bad++;
      failed[v.id] = { reason: r.reason || 'no cues', at: new Date().toISOString() };
      console.log(`${label}  FAILED: ${r.reason || 'no cues'}`);
      continue;
    }
    const withEn = r.cues.filter((c) => c.en).length;
    const doc = {
      id: v.id,
      title: r.title || v.title,
      channel: r.channel || v.channel,
      lv: v.level,
      durationSec: r.durationSec || v.durationSec,
      topic: v.topic || '',
      why: v.why || '',
      jaTrack: r.jaTrack,
      enTrack: r.enTrack,
      meta: { cues: r.cues.length, withEn, durationSec: r.durationSec || v.durationSec, channel: r.channel || v.channel },
      cues: r.cues,
    };
    fs.writeFileSync(path.join(OUTDIR, `${v.id}.json`), JSON.stringify(doc));
    delete failed[v.id];
    ok++;
    console.log(`${label}  ok  ${r.cues.length} cues, ${withEn} with EN`);
  } catch (e) {
    bad++;
    failed[v.id] = { reason: String(e.message || e), at: new Date().toISOString() };
    console.log(`${label}  ERROR: ${e.message}`);
  }
  if ((n + 1) % 10 === 0) fs.writeFileSync(FAILLOG, JSON.stringify(failed, null, 1));
}

fs.writeFileSync(FAILLOG, JSON.stringify(failed, null, 1));
const total = fs.readdirSync(OUTDIR).filter((f) => f.endsWith('.json')).length;
console.log(`\nbaked ${ok}, failed ${bad}. ${total}/${catalog.length} videos now have cues.`);
if (bad) console.log('Re-run this script later to retry the failures (rate limits clear on their own).');
