# Recitation Coach — Roadmap & Your Tasks

*What gets built, in what order, and exactly what **you** need to do at each step. Total to a genuinely useful personal tool: ~4–5 months of consistent part-time work (roughly 8–10 h/week). Phase 1 delivers the live QARII-style screen within the first month.*

---

## Your one-time setup tasks (do these first, ~1 hour total)

1. **Create free accounts** (no credit card needed for any of these to start):
   - [Hugging Face](https://huggingface.co) — model downloads (ECAPA, Quran ASR checkpoints)
   - [Kaggle](https://kaggle.com) and/or [Google Colab](https://colab.research.google.com) — free batch GPU
   - [Supabase](https://supabase.com) — Postgres + pgvector + storage (needed from Phase 2)
   - [Vercel](https://vercel.com) or [Cloudflare Pages](https://pages.cloudflare.com) — PWA hosting (needed from Phase 1/2)
   - [Fly.io](https://fly.io) — backend hosting (needed only when you deploy the API, Phase 2+; this one will ask for a card)
2. **Pick your recording setup and never change it:** one phone, one quiet room, phone at a consistent distance. Every model in the app assumes recording conditions stay stable.
3. **Confirm the client decision:** Web PWA (Next.js) first, Capacitor wrap later — as specced. (Say now if you'd rather commit to Flutter from day one; it changes Phase 1 scaffolding.)
4. **Keep your ustadh in the loop.** The app is a practice multiplier between lessons, not a replacement — and his ear is the ground truth you'll validate the app against.

## Your recurring tasks (the app cannot do these for you)

- **Record calibration** (~90 s) at the start, and **re-record monthly** — your voice is still settling and a stale profile mis-draws every target lane.
- **Ear-test the outputs at every phase gate** (each "Done when" below). You are the only judge that matters for match quality and cue feel.
- **Practice consistently** — the mastery map, spaced repetition, and weekly reports only mean something with regular takes.

---

## Build phases

### Phase 0 · Proof (1 weekend) — kill bad assumptions cheaply
**Build:** a single Jupyter notebook. 10 reciters × Al-Fatihah from EveryAyah → ECAPA embeddings + basic style features → record yourself → rank reciters by similarity.
**You:** record ~5 short takes; listen to the top-5 ranking and judge it honestly.
**Done when:** the ranking passes your ear test. If it feels random, we fix features *before writing any app code*.

### Phase 1 · The QARII moment (2–3 weeks) — the screen you actually asked for
**Build:** calibration flow; range-mapping maths; live lane with cue engine for one ayah in shadow mode. Client-only prototype — no backend.
**You:** do the 90-second calibration properly; practice Al-Fatihah along with Al-Husary daily for a few days and report which cues feel right, nagging, or late (cue thresholds are tuned to *your* wobble).
**Done when:** you can follow Al-Husary through an ayah with live too-low/too-high/good cues that feel right.

### Phase 2 · Match Engine (2–3 weeks)
**Build:** ingestion pipeline into Postgres/pgvector; three-axis scoring with the range gate; top-5 matched reciters screen with A/B playback; weight slider.
**You:** create the Supabase project; decide on backend hosting (see COSTS.md — this is where the R0/month floor can end); A/B-listen to matches and check the slider changes rankings sensibly.
**Done when:** your top match is someone you would actually choose to imitate.

### Phase 3 · Full mimicry (3–4 weeks)
**Build:** any surah on demand (lazy contour prep); solo mode with DTW review, overlay and per-word chips; per-ayah mastery map across all 114 surahs.
**You:** record solo takes and sanity-check the reviews — agree/disagree per chip; that feedback tunes the scorer.
**Done when:** you record a solo ayah and get a review you agree with; progress persists.

### Phase 4 · Tajweed Tier 1 (3–4 weeks)
**Build:** rule engine from QUL tajweed markup; madd, waqf, qalqalah and pace detectors wired into live cues and review chips.
**You:** deliberately recite *wrong* (short madds, skipped stops) to verify detection; verify correct recitation isn't nagged. If possible, cross-check a few flagged takes with your teacher.
**Done when:** deliberately short madds are caught; correct ones are not nagged.

### Phase 5 · Academy + drills (4+ weeks)
**Build:** maqam detector; four-move maqam lessons (hear it / sing it / apply it / test it), one maqam at a time starting with whichever sits closest to your natural contours; makharij minimal-pair drills with GOP scoring; weekly report; Tier-2 detectors behind soft language.
**You:** do the ear-training rounds; run drill sessions a few times a week; take the weekly makharij report to your teacher.
**Done when:** you can pass a Bayati ear-test and the drills surface a makharij weakness you didn't know you had.

### Phase 6 · Polish (ongoing)
Spaced repetition over the mastery map; corpus expansion via auto-segmentation of MP3Quran; Capacitor build for your phone's home screen; maybe a second user (which triggers a licensing re-read and the full POPIA posture already specced).
**Done when:** it has replaced passive listening as your default practice.

---

## Decisions I need from you before/while we start

| Decision | Options | Default if you say nothing |
|---|---|---|
| Client stack | Next.js PWA now, Capacitor later · vs Flutter from day one | **Next.js PWA** |
| Backend hosting (from Phase 2) | Run locally when needed (R0) · Fly.io auto-stop (~R20–80/mo) · Fly.io always-on 2 GB (~R182/mo) | **Local during dev, Fly auto-stop at deploy** |
| First matched-reciter shortlist | Any preferences among the EveryAyah 44 (e.g. Al-Husary, Ash-Shuraim, Al-Minshawi)? | Top-10 popular qurra for Phase 0 |
| Practice-take retention | Keep every take in Supabase storage (will eventually hit the 1 GB free cap) · vs keep last N + summaries | **Keep last 50 takes + all scores** |

**Next step when you're ready: Phase 0 is a single notebook — say the word and we build it.**
