# Nihongo

An offline Japanese-learning app for your phone. Kana → JLPT N5–N1 → business keigo.

Install it to your home screen and it behaves like a native app: no account, no
server, no network needed. Everything you save lives on your phone.

---

## Run it right now

```bash
cd nihongo
npm start
```

Then open **http://localhost:8080**.

That is all — there is no build step to run first. The data is already built into
`app/data/`, and the app is plain HTML, CSS and ES modules with no framework.

---

## Put it on your phone

A PWA can only be installed from **https** (or localhost). Your laptop's LAN
address over plain http will render the app but will *not* offer to install it.
Pick one:

**A. Quick test over a tunnel** — works for iPhone and Android, nothing to set up:

```bash
npm start                                    # terminal 1
npx cloudflared tunnel --url http://localhost:8080   # terminal 2
```

Open the `https://….trycloudflare.com` URL it prints, on your phone.

**B. Android over USB** — fastest for repeated testing:

1. Enable USB debugging on the phone, plug it in.
2. In desktop Chrome open `chrome://inspect` → **Port forwarding** → add
   `8080` → `localhost:8080`.
3. On the phone open `http://localhost:8080`. That counts as a secure context.

**C. Host it permanently** (recommended — then it is just an app you have):

- **GitHub Pages.** Two ways, both work:
  - *Settings → Pages → Source: **GitHub Actions*** — the included workflow at
    `.github/workflows/pages.yml` publishes `app/` as the site root, so the app
    is at `https://<user>.github.io/<repo>/`. This is the tidier one.
  - *Settings → Pages → Source: **Deploy from a branch**, `main` / `/ (root)`* —
    publishes the whole repo. The root `index.html` redirects to `app/`, so the
    same URL works; the app itself sits at `/<repo>/app/`.
- **Cloudflare Pages / Netlify.** Point them at this repo with publish
  directory `app` and no build command. Or one-off:
  `npx wrangler pages deploy ./app --project-name nihongo`

### Then install it

- **Android / Chrome:** a banner appears, or menu → *Install app*. Settings in
  the app also has an Install button.
- **iPhone / Safari:** Share → **Add to Home Screen**. Do this — iOS can clear
  a website's stored data after about a week of not visiting, but home-screen
  apps are protected. The app asks iOS for persistent storage on every launch,
  and iOS only grants it once you have installed.

---

## What is in it

**Per level, N5 through N1**

| | |
|---|---|
| **Words** | 8,052 JLPT words ordered by how often they actually turn up in speech, not alphabetically. Each with readings, furigana, part of speech, and real example sentences. |
| **Kanji** | 2,211 characters with readings, stroke counts, the components they are built from, and the words that use them. |
| **Grammar** | 695 grammar points, taught rather than listed: the level hands you the next few in teaching order, each one explained — formation, nuance, "watch out" notes, worked examples — before you practise it by rebuilding it inside its own example sentences. How the practice goes is the grade, and the point then joins the same review deck as everything else. The full list is still one tap away for looking things up. |
| **Flashcards** | FSRS-5 spaced repetition — the algorithm Anki now ships by default. Four grade buttons, each showing when you will next see the card. Swipe left to skip a card you knew, right to go back — which undoes the grade, the log entry and the day's count, not just the display. |
| **Reading** | 15 original graded short stories (3 per level, 418 sentences) written to each level's exact kanji and grammar list and independently checked, plus i+1 sentence practice from Tatoeba and a paste-anything reader. |
| **Listen** | Japanese audio with big Japanese + English subtitles, at every level. Tap any word and it pauses while you read. Works offline. |
| **Watch** | 131 verified YouTube videos with big Japanese + English subtitles below the player. Tap any word. (Subtitle tracks need one build step — see below.) |
| **Conjugation drill** | 1,848 verbs and adjectives, drilled only in forms you have reached at your level. |
| **Five ways through a list** | Both the word list and the kanji list have a mode bar: **List**, **Flashcards** (shuffled, tap to flip), **Quiz** (four-choice, both directions, offers to add what you missed to your real deck), **Match** (pair five at a time), **Listen** (hear it, pick it). None of these touch your review schedule. |
| **Say it yourself** | Production practice — English in, Japanese out, built from kana tiles. Unlocks per word once you can reliably recognise it. |

**Before N5** — hiragana and katakana, 104 characters with a quiz that knows
which pairs learners actually confuse (ね/れ/わ, シ/ツ, ソ/ン).

**Beyond the JLPT** — six tracks for the things an exam does not test, 53
modules and 603 items, each written and then independently checked by a second
pass:

| | |
|---|---|
| 旅 **Travel** | From N5 — the one track usable on day one. Weighted toward what staff *say to you*, because that is the half that actually goes wrong. |
| 話 **Real casual Japanese** | Plain form and when switching down is welcome rather than presumptuous, contractions, sentence-final particles, 相槌, LINE Japanese. |
| 音 **Sounds and counting** | Onomatopoeia (擬音語・擬態語) and counters, including the readings that change irregularly — 一本 いっぽん, 三本 さんぼん, 六本 ろっぽん laid out in a row. |
| 方 **Dialects** | Mostly 関西弁 — の systematic differences and the words with no standard equivalent — then a tour of 東北, 博多, 名古屋, 広島, 沖縄. |
| 仕 **Business** | Keigo as a transformation drill, email as block assembly, phone, meetings, 報連相, and 社内 vs 社外. |
| 学 **Academic** | Seminar register, である体 vs ですます体, academic connectives, hedging, presenting research. |

Every comparison table (keigo, Kansai, counters, register) doubles as a
multiple-choice drill generated from the table itself.

**Casual and dialect marking** — forms that are casual (食べてる, わかんない) or
dialect (せや, ばり速か, めんそーれ) carry a small badge wherever they appear, so you
can see at a glance what not to say to a client. Tap one for the explanation and
a link to the module it comes from. 84 forms across casual plus seven regions;
choose which to mark in Settings, or browse them all under Settings → *See every
marked form*.

**Everywhere** — tap any Japanese word, anywhere in the app, and a sheet tells
you what it means, what its dictionary form is, *how it was conjugated to get
there*, its politeness register, and lets you save it. Saved words join your
reviews automatically.

---

## Tap-any-word, offline

Japanese has no spaces and words conjugate heavily, so looking up a word in
running text is the hard part. This app does it on device, with no server and
no 17 MB morphological analyser:

- a 22,640-entry JMdict index, 1.1 MB gzipped
- a deinflection engine that unwinds stacked conjugations —
  `食べさせられなかった` → `食べる`, `見せてもらえますか` → `見せる`
- longest-match tokenisation over the result, about 4 ms per sentence

It handles keigo correctly, including the honorific prefixes (`お忙しい`,
`ご確認`) that trip up the standard IPADIC tokenisers.

---

## Offline

The shell, the dictionary and all of N5 are cached the first time you open the
app, so it works on a train immediately. Other levels cache as you visit them,
or all at once: open a level and tap **Download &lt;level&gt; for offline**, which
also pulls that level's stories, the sentence corpus and the conjugation tables.

The only part that needs a connection is the YouTube player itself. Everything
else — words, kanji, grammar, stories, reviews, tap-any-word lookup — works with
the phone in aeroplane mode.

---

## Updating

You install it once. After that the app looks for a new version on launch, when
it comes back to the foreground, and once an hour while it is open; a new build
downloads in the background and a bar then offers to restart into it. **Update**
applies it, **Later** keeps it for next time — the bar only exists while a
version is actually waiting, and the swap never happens under a review in
progress. Settings shows the running build and has a *Check for updates* button
for when you cannot wait.

An update never costs you anything you had: your words and history are in
IndexedDB, untouched by it, and the levels you downloaded for offline are
carried across to the new build's cache rather than re-fetched.

A build's cached shell is immutable: an installed version keeps serving its own
files until its worker is replaced in one step. The worker used to refresh each
file in the background as it served it, which meant that after a deploy a page
could be running yesterday's `main.js` and today's screens at the same time —
two releases in one page, which is not a stale page but a broken one. While
developing, a hard reload still goes straight to the network.

---

## Your data

Saved words, review history and progress live in IndexedDB on your device and
are never sent anywhere. **Back them up**: Settings → *Download a backup* gives
you a single JSON file, and *Restore* merges it back. There is no cloud copy —
if you lose the phone without a backup, the words are gone.

---

## Rebuilding the data

Only needed if you want fresher upstream data. `app/data/` is already built.

```bash
npm run fetch     # download the source corpora into build/cache/  (~150 MB)
npm run build     # rebuild app/data/                              (~10 MB)
```

### Why Listen mode exists

The request was video with Japanese audio and both Japanese and English
subtitles. YouTube has exactly that and will not let anything fetch the caption
tracks (see below). The obvious alternatives were checked and none of them
carry Japanese-audio material with bilingual subtitles:

| Source | Finding |
|---|---|
| TED (`graphql.ted.com` + `/talks/subtitles/id/<id>/lang/<lang>`) | The API works well and returns clean timed cues in both languages — but every one of the 50 talks sampled is **English audio** with translated subtitles. Wrong direction for listening practice. |
| Wikimedia Commons | Zero Japanese TimedText pages, zero video hits. |
| archive.org | 3,455 Japanese items, 198 with subtitles — nearly all auto-generated English ASR, no bilingual pairs. |
| Vimeo | oembed 404s; the API needs an account token. |

So the app speaks the material itself, using the device's Japanese
text-to-speech voice over the graded stories and sentences. Because the app
drives the speech, the subtitles are synced by construction rather than by
matching timestamps, pausing is instant, and it works offline at every level
from N5 to N1 — which the video route never would have.

It needs a Japanese TTS voice. iPhones have one. On Android, install *Google
Text-to-speech* and add Japanese under Settings → System → Languages →
Text-to-speech. Without a voice the screen still works as a reader.

### Video subtitles

The Watch screen needs each video's caption track baked in at build time —
browsers cannot fetch them at runtime (CORS), and the URLs are signed and
expire in about seven hours.

```bash
npm run bake:videos              # all 131 catalogued videos
node build/bake-videos.mjs --limit 20 --level N5
```

It is deliberately slow and serial, and it is **resumable** — run it again and
it skips whatever it already has, so nothing is ever lost or repeated.

**As of this build the bake does not succeed.** YouTube is currently refusing
caption downloads with HTTP 429 across the board — not just from one IP. That
was verified against a direct fetch, `yt-dlp`, and three independent
third-party transcript services, all of which fail the same way. This is a
change on YouTube's side, not a bug here, and it may well clear on its own.
Re-run the command occasionally; the moment it succeeds, run `npm run build`
and the Watch screen switches from YouTube's own captions to the big tappable
version with no other changes.

Until then the Watch screen still lists all 131 videos, plays them with
YouTube's own captions turned on, and points at **Read → Paste Japanese text**,
which gives the identical tap-any-word experience on any text you paste in.

The catalogue in `build/research/videos-verified.json` lists 131 videos that
were each confirmed to have a human-written Japanese caption track, 63 of them
with English as well.

---

## Layout

```
app/                 the app — this is the whole deployable
  index.html         shell
  css/app.css        one stylesheet
  js/                ES modules, no bundler
    srs.js           FSRS-5 scheduler
    deinflect.js     conjugation → dictionary form
    tokenize.js      longest-match segmentation
    dict.js          JMdict lookup
    store.js         IndexedDB + backup/restore
    grammar.js       grammar syllabus + question generation (no DOM)
    swipe.js         the one swipe gesture, used by every card screen
    screens/         one module per screen
  data/              generated — do not edit by hand
  sw.js              service worker (offline)
build/               build-time only, never shipped
  fetch-sources.mjs  download upstream corpora
  build-data.mjs     corpora → app/data
  bake-videos.mjs    YouTube captions → app/data/videos
  lib/               shared build helpers
  test/              SRS tests and a Playwright pass over every screen
serve.mjs            zero-dependency local server
```

## Tests

```bash
npm test            # scheduler, deinflection (24 cases + 10 keigo), tokenizer, grammar syllabus
npm run test:e2e    # every screen in a headless phone browser
node build/test/layout.mjs        # no horizontal overflow at 360px and 320px
node build/test/blockers.mjs      # save->review, backup restore, offline video fallback
node build/test/offline.mjs       # install, go offline, still works
node build/test/offline-level.mjs # per-level download then offline
node build/test/produce.mjs       # production practice
node build/test/grammar-ui.mjs    # explain -> practise -> scheduled -> reviewed
node build/test/swipe.mjs         # buttons reachable without scrolling, swipe + undo
node build/test/update.mjs        # install v1, deploy v2, update in place, keep your data
node build/test/upgrade.mjs      # upgrade from the real previous commit, mixed-build safety
```

The browser tests need a server on port 8099 (`node serve.mjs 8099`) and
`npm --prefix build install` once for Playwright.

---

## Licences

Built entirely on openly licensed data — JMdict and KANJIDIC2 (EDRDG),
Jonathan Waller's JLPT lists, Tatoeba, JmdictFurigana, Kanjium, KanjiVG,
OpenJLPT and jkindrix/japanese-language-data. Derived data is redistributed
under **CC BY-SA 4.0**, as those licences require. Full attribution is in the
app under Settings → Credits.

Videos are embedded from YouTube and belong to their creators; subtitles come
from each video's own caption track.
