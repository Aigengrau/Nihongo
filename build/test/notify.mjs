// The parts of the reminder engine that can be wrong silently: the schedule,
// and the promise that "word of the day" means a different word every day.
import { readFileSync } from 'node:fs';
import { KINDS, DEFAULTS, plan, slotAt, cyclePick, compose, dayNumber } from '../../app/js/notify.js';

let fails = 0;
const ok = (label, cond) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) fails++;
};

const settings = () => JSON.parse(JSON.stringify(DEFAULTS));
const HHMM = (ts) => new Date(ts).toTimeString().slice(0, 5);

// ---------------------------------------------------------------- schedule
console.log('\nschedule:');
{
  const s = settings();
  const now = new Date(2026, 2, 3, 10, 0, 0).getTime();   // Tuesday 10:00
  const p = plan(s, { now, days: 3 });

  ok('nothing is scheduled in the past', p.every((x) => x.at > now));
  ok('sorted soonest first', p.every((x, i) => i === 0 || p[i - 1].at <= x.at));

  const on = KINDS.filter((k) => s[k.id].on).map((k) => k.id);
  const today = p.filter((x) => new Date(x.at).getDate() === 3).map((x) => x.kind);
  ok('today only offers slots still to come',
    today.every((k) => slotAt(new Date(now), s[k].time) > now));
  ok('tomorrow offers every switched-on kind',
    on.every((k) => p.some((x) => new Date(x.at).getDate() === 4 && x.kind === k)));

  ok('each slot lands on its wall-clock time',
    p.every((x) => HHMM(x.at) === s[x.kind].time));
}

{
  const s = settings();
  s.word.time = '06:15';
  const now = new Date(2026, 2, 3, 10, 0, 0).getTime();
  const first = plan(s, { now, days: 2 }).find((x) => x.kind === 'word');
  ok('a changed time is honoured', HHMM(first.at) === '06:15');
}

{
  const s = settings();
  s.days = [6, 0];                                        // weekends only
  const now = new Date(2026, 2, 3, 10, 0, 0).getTime();   // Tuesday
  const p = plan(s, { now, days: 14 });
  ok('weekday filter is respected', p.every((x) => [0, 6].includes(new Date(x.at).getDay())));
  ok('weekend-only still schedules something', p.length > 0);
}

{
  const s = settings();
  for (const k of KINDS) s[k.id].on = false;
  ok('everything off schedules nothing', plan(s, { days: 14 }).length === 0);
}

// Spring forward in Europe/Berlin was 2026-03-29 02:00. A reminder set for
// 08:00 must still be at 08:00 on either side of it, not 07:00.
{
  const s = settings();
  const now = new Date(2026, 2, 26, 9, 0, 0).getTime();
  const words = plan(s, { now, days: 7 }).filter((x) => x.kind === 'word');
  ok('wall-clock time survives a DST change', words.every((x) => HHMM(x.at) === s.word.time));
  ok('and the day numbers still advance by one',
    words.every((x, i) => i === 0 || x.day === words[i - 1].day + 1));
}

// ---------------------------------------------------------------- rotation
console.log('\nrotation:');
for (const n of [1, 2, 7, 79, 100, 675, 1024]) {
  const list = Array.from({ length: n }, (_, i) => i);
  const seen = new Set();
  for (let d = 0; d < n; d++) seen.add(cyclePick(list, d, 'word:N5'));
  ok(`${n} items are all used before any repeats`, seen.size === n);
}
{
  const list = Array.from({ length: 50 }, (_, i) => i);
  const a = Array.from({ length: 10 }, (_, d) => cyclePick(list, d, 'word:N5'));
  const b = Array.from({ length: 10 }, (_, d) => cyclePick(list, d, 'kanji:N5'));
  ok('different kinds do not move in lockstep', a.some((x, i) => x !== b[i]));
  ok('the same day always gives the same answer',
    cyclePick(list, 40, 'word:N5') === cyclePick(list, 40, 'word:N5'));
  ok('negative day numbers stay in range',
    cyclePick(list, -3, 'word:N5') >= 0 && cyclePick(list, -3, 'word:N5') < 50);
}
ok('an empty list picks nothing', cyclePick([], 1, 'x') === null);

// ---------------------------------------------------------------- content
console.log('\ncontent:');
const read = (p) => JSON.parse(readFileSync(new URL(`../../app/data/${p}`, import.meta.url), 'utf8'));
const ctx = {
  level: 'N5',
  vocab: read('levels/n5/vocab.json'),
  kanji: read('levels/n5/kanji.json'),
  grammar: read('levels/n5/grammar.json'),
};

const day = dayNumber(new Date(2026, 2, 3).getTime());
for (const k of KINDS) {
  const c = compose(k.id, day, ctx);
  ok(`${k.id} composes`, !!c && !!c.title && !!c.body && !!c.url);
  if (c) {
    ok(`  ${k.id} title fits a notification`, c.title.length <= 80);
    ok(`  ${k.id} body fits a notification`, c.body.length <= 150);
    ok(`  ${k.id} links somewhere the router knows`, /^#\//.test(c.url));
  }
}
ok('the grammar link names a real point',
  ctx.grammar.some((g) => compose('grammar', day, ctx).url === `#/grammar/${g.lv}/${g.id}`));
ok('empty data composes nothing rather than a blank notification',
  compose('word', day, { level: 'N5', vocab: [], kanji: [], grammar: [] }) === null);
ok('the daily nudge works with no data at all',
  !!compose('reminder', day, { level: 'N5', vocab: [], kanji: [], grammar: [] }));

// A fortnight of real notifications, as the app would bake them.
{
  const s = settings();
  for (const k of KINDS) s[k.id].on = true;
  const rows = plan(s, { now: Date.now(), days: 14 }).map((x) => compose(x.kind, x.day, ctx));
  ok('every slot in a fortnight has something to say', rows.every(Boolean));
  const words = rows.filter((r) => r.title.startsWith('語'));
  ok('fourteen days, fourteen different words', new Set(words.map((r) => r.title)).size === words.length);
}

console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
