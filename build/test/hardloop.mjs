import { newCard, review, RATING, STATE } from '../../app/js/srs.js';
let c = newCard('x', 'n5');
const t0 = Date.UTC(2026, 0, 1);
console.log('12 consecutive HARD ratings, 10 minutes apart:');
for (let i = 0; i < 12; i++) {
  const now = t0 + i * 600000;
  const r = review(c, RATING.HARD, { now });
  c = r.card;
  console.log(`  ${String(i + 1).padStart(2)}: state=${c.state} step=${c.step} S=${c.S.toFixed(3)} D=${c.D.toFixed(2)} sched=${c.scheduledDays}d due=+${Math.round((c.due - now) / 60000)}m`);
}
