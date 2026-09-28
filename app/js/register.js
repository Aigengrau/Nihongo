// Register and dialect marking.
//
// Some forms are not wrong, just marked: 食べてる is casual, せや is Kansai. A
// learner reading real Japanese needs to know which is which, because using a
// dialect form in a job interview or a casual contraction with a client lands
// badly. This badges those forms wherever they appear.
//
// The index is built from the Beyond-JLPT track content (build/build-data.mjs)
// so it never drifts from what the app teaches.

import * as store from './store.js';

export const LABELS = {
  casual: { short: '話', name: 'Casual', hint: 'Plain / spoken form — friends, not clients.' },
  kansai: { short: '関', name: 'Kansai', hint: 'Kansai dialect 関西弁.' },
  tohoku: { short: '東', name: 'Tohoku', hint: 'Tohoku dialect 東北弁.' },
  hokkaido: { short: '北', name: 'Hokkaido', hint: 'Hokkaido dialect.' },
  hakata: { short: '博', name: 'Hakata', hint: 'Hakata / Kyushu dialect 博多弁.' },
  nagoya: { short: '名', name: 'Nagoya', hint: 'Nagoya dialect 名古屋弁.' },
  hiroshima: { short: '広', name: 'Hiroshima', hint: 'Hiroshima dialect 広島弁.' },
  okinawa: { short: '沖', name: 'Okinawa', hint: 'Okinawan / うちなーぐち.' },
};

export const DIALECTS = ['kansai', 'tohoku', 'hokkaido', 'hakata', 'nagoya', 'hiroshima', 'okinawa'];

let index = null;
let enabled = null;

async function loadIndex() {
  if (index) return index;
  try {
    index = await fetch('./data/register.json').then((r) => r.json());
  } catch { index = {}; }
  return index;
}

/** Which tags the learner has asked to see. Defaults to casual + Kansai. */
export async function enabledTags() {
  if (enabled) return enabled;
  const saved = await store.setting('registerTags', null);
  enabled = new Set(saved ?? ['casual', 'kansai']);
  return enabled;
}

export async function setEnabledTags(tags) {
  enabled = new Set(tags);
  await store.setSetting('registerTags', [...enabled]);
  window.dispatchEvent(new CustomEvent('nihongo:register'));
}

export async function ready() {
  await Promise.all([loadIndex(), enabledTags()]);
  return index;
}

/**
 * The marking for one surface form, or null. Checks the surface and the
 * dictionary base, so 食べてた finds 食べてる's entry through its base form.
 * @returns {{tag:string, en:string, note:string, src:string}|null}
 */
export function markOf(surface, base) {
  if (!index || !enabled?.size) return null;
  for (const key of [surface, base]) {
    const row = key && index[key];
    if (!row) continue;
    const tag = row.t.find((t) => enabled.has(t));
    if (tag) return { tag, en: row.en, note: row.note, src: row.src };
  }
  return null;
}

/** Every marked form, for the browse screen. */
export function all() {
  if (!index) return [];
  return Object.entries(index)
    .map(([form, r]) => ({ form, ...r }))
    .sort((a, b) => a.t[0].localeCompare(b.t[0]) || a.form.localeCompare(b.form, 'ja'));
}

export const badge = (tag) => {
  const l = LABELS[tag];
  if (!l) return '';
  return `<span class="reg reg-${tag}" title="${l.name}">${l.short}</span>`;
};
