#!/usr/bin/env node
// Downloads every upstream dataset into build/cache/raw/.
// Run once (or when you want fresher data), then `npm run build`.
//
// Everything here is openly licensed — see the Credits screen in the app.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'build', 'cache', 'raw');

const JK = 'https://raw.githubusercontent.com/jkindrix/japanese-language-data/main/data';
const OJ = 'https://raw.githubusercontent.com/evanclan/OpenJLPT/main/data/json';

const files = [
  // JLPT spine, grammar, enrichment and cross-references (CC BY-SA 4.0)
  ...[
    'grammar/grammar.json', 'grammar/conjugations.json',
    'enrichment/frequency-corpus.json', 'enrichment/frequency-subtitles.json',
    'enrichment/furigana.json', 'enrichment/jlpt-classifications.json',
    'enrichment/stroke-order-index.json', 'core/radicals.json',
    'corpus/sentences.json', 'cross-refs/word-to-sentences.json',
    'cross-refs/sentence-to-words.json', 'cross-refs/kanji-to-words.json',
  ].map((p) => [`${JK}/${p}`, `jk/${p.replace(/\//g, '-')}`]),
  // OpenJLPT: curated example pairs and KANJIDIC-derived kanji detail (CC BY-SA 4.0)
  ...[5, 4, 3, 2, 1].flatMap((n) => [
    [`${OJ}/vocab/n${n}.json`, `openjlpt/vocab-n${n}.json`],
    [`${OJ}/kanji/n${n}.json`, `openjlpt/kanji-n${n}.json`],
    [`${OJ}/grammar/n${n}.json`, `openjlpt/grammar-n${n}.json`],
  ]),
];

const force = process.argv.includes('--force');

async function get(url, rel) {
  const out = path.join(CACHE, rel);
  if (!force && fs.existsSync(out) && fs.statSync(out).size > 0) {
    console.log(`  cached  ${rel}`);
    return;
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const r = await fetch(url);
  if (!r.ok) { console.log(`  FAILED  ${rel}  HTTP ${r.status}`); return; }
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(out, buf);
  console.log(`  ok      ${rel.padEnd(44)} ${(buf.length / 1024).toFixed(0)} KB`);
}

console.log('\nfetching study data\n');
for (const [url, rel] of files) await get(url, rel);

// JMdict: the dictionary behind tap-any-word. Released as a zip per build.
console.log('\nfetching JMdict\n');
const rel = await (await fetch('https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest')).json();
for (const name of ['jmdict-eng-common', 'jmdict-eng-3']) {
  const asset = rel.assets?.find((a) => a.name.startsWith(name) && a.name.endsWith('.zip'));
  if (!asset) { console.log(`  FAILED  no asset matching ${name}`); continue; }
  const target = path.join(CACHE, 'jmdict', asset.name.replace('.zip', ''));
  if (!force && fs.existsSync(target)) { console.log(`  cached  ${asset.name}`); continue; }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  console.log(`  downloading ${asset.name} (${(asset.size / 1048576).toFixed(1)} MB)…`);
  const zip = Buffer.from(await (await fetch(asset.browser_download_url)).arrayBuffer());
  // minimal zip reader: one deflated entry per archive
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const cdOff = zip.readUInt32LE(eocd + 16);
  const nameLen = zip.readUInt16LE(cdOff + 28);
  const extraLen = zip.readUInt16LE(cdOff + 30);
  const commentLen = zip.readUInt16LE(cdOff + 32);
  const localOff = zip.readUInt32LE(cdOff + 42);
  const entryName = zip.toString('utf8', cdOff + 46, cdOff + 46 + nameLen);
  const method = zip.readUInt16LE(localOff + 8);
  const lNameLen = zip.readUInt16LE(localOff + 26);
  const lExtraLen = zip.readUInt16LE(localOff + 28);
  const dataStart = localOff + 30 + lNameLen + lExtraLen;
  const compSize = zip.readUInt32LE(cdOff + 20);
  const raw = zip.subarray(dataStart, dataStart + compSize);
  const data = method === 0 ? raw : zlib.inflateRawSync(raw);
  fs.writeFileSync(path.join(CACHE, 'jmdict', entryName), data);
  void extraLen; void commentLen;
  console.log(`  ok      ${entryName.padEnd(44)} ${(data.length / 1048576).toFixed(1)} MB`);
}

console.log('\ndone — now run:  npm run build\n');
