// Loads the shipped study data. Everything is fetched once and memoised; the
// service worker handles the offline story, so this layer stays simple.

const cache = new Map();
const BASE = './data';

/** Thrown when data simply has not been downloaded yet, rather than being broken. */
export class OfflineDataError extends Error {
  constructor(path) {
    super(`${path} is not downloaded`);
    this.name = 'OfflineDataError';
    this.path = path;
  }
}

async function json(path) {
  if (cache.has(path)) return cache.get(path);
  const p = fetch(`${BASE}/${path}`)
    .then((r) => {
      if (r.status === 503 && r.headers.get('X-Nihongo-Offline')) throw new OfflineDataError(path);
      if (!r.ok) throw new Error(`${path}: ${r.status}`);
      return r.json();
    })
    .catch((e) => { cache.delete(path); throw e; });
  cache.set(path, p);
  return p;
}

export const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
export const LEVEL_NAMES = {
  N5: 'Absolute beginner',
  N4: 'Basic conversation',
  N3: 'The bridge',
  N2: 'Work-ready',
  N1: 'Full fluency',
};

export const index = () => json('index.json');
export const kana = () => json('kana.json');
export const conjugations = () => json('conjugations.json');
export const sentences = () => json('sentences.json');
export const i1 = () => json('i1.json');
export const sentenceWords = () => json('sentence-words.json');

const lc = (lv) => String(lv).toLowerCase();
export const vocab = (lv) => json(`levels/${lc(lv)}/vocab.json`);
export const kanji = (lv) => json(`levels/${lc(lv)}/kanji.json`);
export const grammar = (lv) => json(`levels/${lc(lv)}/grammar.json`);

export const videoIndex = () => json('videos/index.json').catch(() => []);
export const video = (id) => json(`videos/${id}.json`);
export const storyIndex = () => json('stories/index.json').catch(() => []);
export const story = (id) => json(`stories/${id}.json`);

/** Every vocab item across all levels, indexed by id — used by saved words and lookups. */
let allVocabP = null;
export function allVocab() {
  if (!allVocabP) {
    allVocabP = Promise.all(LEVELS.map(vocab)).then((lists) => {
      const byId = new Map();
      const byWord = new Map();
      for (const list of lists) {
        for (const w of list) {
          byId.set(w.id, w);
          if (!byWord.has(w.w)) byWord.set(w.w, w);
          if (w.r && !byWord.has(w.r)) byWord.set(w.r, w);
        }
      }
      return { byId, byWord, list: lists.flat() };
    });
  }
  return allVocabP;
}

/** Level totals for progress rings, without loading every level's data. */
export async function levelStats() {
  const idx = await index();
  return Object.fromEntries(idx.levels.map((l) => [l.level, l]));
}
