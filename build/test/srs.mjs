import { newCard, review, preview, RATING, STATE, retrievability, DEFAULT_W, buildQueue, burySiblings, humanInterval } from '../../app/js/srs.js';
const DAY = 86400000;
let now = Date.UTC(2026, 0, 1);

console.log('params:', DEFAULT_W.length, 'weights');
console.log('R(0d,S=3)=', retrievability(0,3).toFixed(3), ' R(3d,S=3)=', retrievability(3,3).toFixed(3), '(should be ~0.9)');

// A learner who always answers Good
let c = newCard('vocab:1:rec', 'n5');
console.log('\nGOOD every time:');
for (let i = 0; i < 8; i++) {
  const r = review(c, RATING.GOOD, { now });
  c = r.card;
  console.log(`  rep ${i+1}: state=${c.state} S=${c.S.toFixed(2)} D=${c.D.toFixed(2)} next=${c.scheduledDays ? humanInterval(c.scheduledDays) : Math.round((c.due-now)/60000)+'m'}`);
  now = c.due;
}

// A lapse must shorten the interval and raise difficulty
console.log('\nthen AGAIN (a lapse):');
const before = { S: c.S, D: c.D };
const r2 = review(c, RATING.AGAIN, { now });
console.log(`  S ${before.S.toFixed(2)} -> ${r2.card.S.toFixed(2)} (must not increase), D ${before.D.toFixed(2)} -> ${r2.card.D.toFixed(2)} (must increase), lapses=${r2.card.lapses}, state=${r2.card.state}`);

// Button previews on a fresh card
console.log('\npreview on a new card:', JSON.stringify(preview(newCard('x','n5'), { now })));

// Monotonicity: Easy >= Good >= Hard >= Again
let cc = newCard('m:1','n5'); cc = review(cc, RATING.GOOD, {now}).card; cc = review(cc, RATING.GOOD, {now: now+3*DAY}).card;
const ivs = Object.fromEntries(Object.entries(RATING).map(([k,v]) => [k, review(cc, v, {now: now+10*DAY}).card.scheduledDays ?? 0]));
console.log('intervals by rating:', JSON.stringify(ivs));
const ok = ivs.AGAIN <= ivs.HARD && ivs.HARD <= ivs.GOOD && ivs.GOOD <= ivs.EASY;
console.log('monotonic (Again<=Hard<=Good<=Easy):', ok ? 'PASS' : 'FAIL');

// Queue building + sibling burying
const cards = [
  ...Array.from({length:5},(_,i)=>({...newCard(`vocab:${i}:rec`,'n5'), ord:i})),
  ...Array.from({length:5},(_,i)=>({...newCard(`vocab:${i}:recall`,'n5'), ord:i})),
  ...Array.from({length:12},(_,i)=>({...newCard(`vocab:${100+i}:rec`,'n5'), state:STATE.REVIEW, due: now - i*1000, S:5, D:5})),
];
const q = buildQueue(cards, { now, newPerDay: 4, reviewCap: 100 });
const b = burySiblings(q);
console.log(`\nqueue: ${q.length} cards (${q.filter(c=>c.state===STATE.NEW).length} new, ${q.filter(c=>c.state===STATE.REVIEW).length} review)`);
console.log(`after burying siblings: ${b.queue.length} kept, ${b.buried.length} buried`);
console.log('no duplicate word in queue:', new Set(b.queue.map(c=>c.key.split(':').slice(0,2).join(':'))).size === b.queue.length ? 'PASS' : 'FAIL');

// Nothing should ever produce NaN or a due date in the past
let bad = 0, cur = newCard('z','n5');
for (let i=0;i<200;i++){ const rt = 1 + (i % 4); const r = review(cur, rt, { now: now + i*DAY }); cur = r.card;
  if (!isFinite(cur.S) || !isFinite(cur.D) || cur.D < 1 || cur.D > 10 || cur.due <= now + i*DAY - 1) bad++; }
console.log('\n200 mixed reviews - invalid states:', bad, bad === 0 ? 'PASS' : 'FAIL');
