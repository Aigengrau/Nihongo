// Build-time YouTube caption fetcher. Browsers can't do this (CORS) - we bake the result into the app.
// YouTube's public innertube web key - published in every youtube.com page, not a secret.
// NOSONAR
const KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const CLIENTS = [
  { clientName: 'ANDROID', clientVersion: '20.10.38', androidSdkVersion: 34 },
  { clientName: 'IOS', clientVersion: '20.10.4', deviceModel: 'iPhone16,2' },
  { clientName: 'MWEB', clientVersion: '2.20250101.00.00' },
  { clientName: 'WEB', clientVersion: '2.20250101.00.00' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Serialise every YouTube hit through one queue with a gap, and back off hard on 429.
let chain = Promise.resolve();
let gap = 2200; // research: <2s between timedtext hits triggers a long IP-level 429
function queued(fn) {
  const run = chain.then(async () => {
    await sleep(gap);
    return fn();
  });
  chain = run.then(() => {}, () => {});
  return run;
}

async function get(url, { json = false, tries = 6 } = {}) {
  for (let i = 0; i < tries; i++) {
    const r = await queued(() =>
      fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8' } })
    );
    if (r.status === 429 || r.status === 503) {
      gap = Math.min(gap * 2, 20000);
      await sleep(2000 * 2 ** i);
      continue;
    }
    gap = Math.max(2200, gap * 0.9);
    if (!r.ok) return { status: r.status, text: null };
    const text = await r.text();
    return { status: r.status, text, json: json ? safeJson(text) : null };
  }
  return { status: 429, text: null };
}

const safeJson = (t) => { try { return JSON.parse(t); } catch { return null; } };

export async function player(videoId) {
  let last = 'unknown';
  for (const client of CLIENTS) {
    for (let i = 0; i < 4; i++) {
      const r = await queued(() =>
        fetch(`https://www.youtube.com/youtubei/v1/player?key=${KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
          body: JSON.stringify({ context: { client: { ...client, hl: 'en', gl: 'US' } }, videoId }),
        })
      );
      if (r.status === 429 || r.status === 503) { gap = Math.min(gap * 2, 20000); await sleep(2000 * 2 ** i); continue; }
      if (!r.ok) { last = `HTTP ${r.status}`; break; }
      const j = await r.json();
      const tracks = j?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (tracks?.length) return { j, tracks, via: client.clientName };
      last = `${j?.playabilityStatus?.status || '?'} / no captionTracks`;
      break;
    }
  }
  return { error: last };
}

const UNESC = (s) => s
  .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));

const NOISE = /^\[(Music|Applause|音楽|拍手|笑|Laughter|♪+)\]$|^[♪\s]+$/i;

// Some channels put a full kana transcription on a second line inside one cue.
// Rendered raw that reads as duplicated text, so keep only the first line when
// the second is a kana-only echo of it.
const KANA_ONLY = /^[぀-ヿー\s、。！？]+$/;
function dropKanaEcho(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 2 && KANA_ONLY.test(lines[1]) && !KANA_ONLY.test(lines[0])) return lines[0];
  return lines.join(' ');
}

// The ANDROID-client baseUrl ALREADY carries fmt=srv3, so appending &fmt=json3
// is silently ignored and you get XML back with HTTP 200. The param must be
// overwritten, not appended.
function withFormat(baseUrl, fmt) {
  try {
    const u = new URL(baseUrl);
    u.searchParams.set('fmt', fmt);
    return u.toString();
  } catch {
    return baseUrl.includes('fmt=')
      ? baseUrl.replace(/([?&])fmt=[^&]*/, `$1fmt=${fmt}`)
      : `${baseUrl}&fmt=${fmt}`;
  }
}

export async function cues(baseUrl) {
  // json3 first; fall back to parsing srv3 XML if it still comes back that way.
  for (const fmt of ['json3', 'srv3']) {
    const r = await get(withFormat(baseUrl, fmt), { json: true });
    if (!r.text) continue;
    if (r.json?.events) {
      const out = r.json.events
        .filter((e) => e.segs)
        .map((e) => ({
          t: +(e.tStartMs / 1000).toFixed(3),
          d: +((e.dDurationMs || 0) / 1000).toFixed(3),
          x: dropKanaEcho(e.segs.map((s) => s.utf8 || '').join('')),
        }))
        .filter((c) => c.x && !NOISE.test(c.x));
      if (out.length) return out;
    }
    if (r.text.includes('<timedtext') || r.text.includes('<transcript')) {
      const out = [];
      const re = /<p\s+t="(\d+)"(?:\s+d="(\d+)")?[^>]*>([\s\S]*?)<\/p>/g;
      let m;
      while ((m = re.exec(r.text))) {
        const x = dropKanaEcho(UNESC(m[3].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')));
        if (x && !NOISE.test(x)) out.push({ t: +(+m[1] / 1000).toFixed(3), d: +((+m[2] || 0) / 1000).toFixed(3), x });
      }
      if (out.length) return out;
      const re2 = /<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
      while ((m = re2.exec(r.text))) {
        const x = UNESC(m[3].replace(/<[^>]+>/g, '')).trim();
        if (x && !NOISE.test(x)) out.push({ t: +m[1], d: +m[2], x });
      }
      if (out.length) return out;
    }
  }
  return null;
}

// ASR tracks arrive as fragments with no punctuation; glue short fragments into readable lines.
export function coalesce(cs, { maxChars = 42, maxGap = 1.2, maxDur = 7 } = {}) {
  const out = [];
  for (const c of cs) {
    const p = out[out.length - 1];
    const gap = p ? c.t - (p.t + p.d) : Infinity;
    if (p && p.x.length + c.x.length <= maxChars && gap <= maxGap && (c.t + c.d - p.t) <= maxDur && !/[。！？．!?]$/.test(p.x)) {
      p.x += c.x;
      p.d = +(c.t + c.d - p.t).toFixed(3);
    } else out.push({ ...c });
  }
  return out;
}

// JA and EN cue boundaries differ; for each JA cue take the EN cues with real temporal overlap.
export function align(ja, en) {
  if (!en?.length) return ja.map((c) => ({ ...c, en: '' }));
  return ja.map((c) => {
    const a = c.t, b = c.t + (c.d || 2);
    const hit = en
      .map((e) => ({ e, ov: Math.max(0, Math.min(b, e.t + (e.d || 2)) - Math.max(a, e.t)) }))
      .filter((h) => h.ov > 0.2 && h.ov / Math.min(b - a, h.e.d || 2) > 0.25)
      .sort((x, y) => x.e.t - y.e.t);
    return { ...c, en: hit.map((h) => h.e.x).join(' ').trim() };
  });
}

export async function probe(videoId) {
  const p = await player(videoId);
  if (p.error) return { id: videoId, ok: false, reason: p.error };
  const d = p.j.videoDetails || {};
  const pick = (lang) =>
    p.tracks.find((t) => t.languageCode === lang && t.kind !== 'asr') ||
    p.tracks.find((t) => t.languageCode?.startsWith(lang) && t.kind !== 'asr') ||
    p.tracks.find((t) => t.languageCode?.startsWith(lang));
  const jt = pick('ja'), et = pick('en');
  return {
    id: videoId, ok: !!jt, via: p.via,
    title: d.title, channel: d.author, durationSec: +d.lengthSeconds || 0,
    jaTrack: jt ? (jt.kind === 'asr' ? 'asr' : 'manual') : null,
    enTrack: et ? (et.kind === 'asr' ? 'asr' : 'manual') : null,
    jaUrl: jt?.baseUrl, enUrl: et?.baseUrl,
    langs: p.tracks.map((t) => t.languageCode + (t.kind === 'asr' ? '(asr)' : '')),
  };
}

export async function fetchSubs(videoId) {
  const p = await probe(videoId);
  if (!p.ok) return p;
  let ja = await cues(p.jaUrl);
  if (!ja) return { ...p, ok: false, reason: 'ja caption fetch failed' };
  if (p.jaTrack === 'asr') ja = coalesce(ja);
  const en = p.enUrl ? await cues(p.enUrl) : null;
  return { ...p, cues: align(ja, en), jaUrl: undefined, enUrl: undefined };
}
