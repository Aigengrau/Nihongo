// Swipe a card.
//
// One gesture language everywhere a card is shown — learn, review, flashcards:
//
//   swipe left  ←   forward: skip this card, which means you knew it
//   swipe right →   back: the previous card, so a misfire is recoverable
//
// The card follows the finger, because a gesture with no feedback feels broken
// rather than absent. Vertical drags are left alone: the page still scrolls.

const THRESHOLD = 68;     // px of travel that commits the gesture
const SLOP = 12;          // px before a touch counts as a drag at all

/**
 * @param {HTMLElement} el         the card
 * @param {object} o
 * @param {() => void} [o.onForward]
 * @param {() => void} [o.onBack]
 * @param {string} [o.forwardLabel]
 * @param {string} [o.backLabel]
 * @param {AbortSignal} [o.signal]
 */
export function swipeable(el, { onForward, onBack, forwardLabel = 'got it', backLabel = 'back', signal } = {}) {
  if (!el) return;
  el.classList.add('swipe');

  const hint = (cls, text) => {
    const s = document.createElement('span');
    s.className = `swipe-hint ${cls}`;
    s.textContent = text;
    s.setAttribute('aria-hidden', 'true');
    el.appendChild(s);
    return s;
  };
  const fwd = onForward ? hint('swipe-hint-f', forwardLabel) : null;
  const back = onBack ? hint('swipe-hint-b', backLabel) : null;

  let x0 = null, y0 = null, dragging = false, dx = 0;

  const paint = () => {
    el.style.transform = dx ? `translateX(${dx * 0.55}px) rotate(${dx * 0.012}deg)` : '';
    const open = Math.min(1, Math.max(0, (Math.abs(dx) - SLOP) / (THRESHOLD - SLOP)));
    if (fwd) fwd.style.opacity = dx < 0 ? open : 0;
    if (back) back.style.opacity = dx > 0 ? open : 0;
  };

  const reset = (animate = true) => {
    dragging = false; x0 = null; dx = 0;
    el.style.transition = animate ? 'transform .18s ease' : '';
    paint();
    if (animate) setTimeout(() => { el.style.transition = ''; }, 200);
  };

  const down = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    x0 = e.clientX; y0 = e.clientY; dx = 0; dragging = false;
    el.style.transition = '';
    // Capture, or a fast flick that leaves the card mid-gesture never reports
    // its pointerup and the card stays stuck half-way off the screen.
    try { el.setPointerCapture(e.pointerId); } catch { /* not supported */ }
  };

  const move = (e) => {
    if (x0 === null) return;
    const mx = e.clientX - x0;
    const my = e.clientY - y0;
    // Decide once: a drag that starts off mostly vertical belongs to the page.
    if (!dragging) {
      if (Math.abs(my) > Math.abs(mx) && Math.abs(my) > SLOP) { x0 = null; return; }
      if (Math.abs(mx) < SLOP) return;
      dragging = true;
    }
    dx = (mx > 0 && !onBack) || (mx < 0 && !onForward) ? mx * 0.25 : mx;   // no handler: rubber band
    paint();
  };

  const up = () => {
    if (x0 === null) return;
    const left = dx < 0;
    const handler = left ? onForward : onBack;
    const go = dragging && Math.abs(dx) >= THRESHOLD ? handler : null;
    if (!go) { reset(); return; }
    // A completed drag still ends in a click, and on these cards a click means
    // "flip" or "open the dictionary". Swallow the one that follows a swipe.
    const swallow = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
    el.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => el.removeEventListener('click', swallow, { capture: true }), 400);
    // Let the card leave the screen before the next one is painted.
    dragging = false; x0 = null;
    el.style.transition = 'transform .14s ease, opacity .14s ease';
    el.style.transform = `translateX(${left ? '-' : ''}60vw)`;
    el.style.opacity = '0';
    setTimeout(go, 120);
  };

  el.addEventListener('pointerdown', down, { signal });
  el.addEventListener('pointermove', move, { signal, passive: true });
  el.addEventListener('pointerup', up, { signal });
  el.addEventListener('pointercancel', () => reset(), { signal });
}

/** The line that tells a first-time user the gesture exists. */
export const swipeHint = (forward = 'skip', back = 'go back') =>
  `<p class="small faint center swipe-tip">swipe ← ${forward} · → ${back}</p>`;
