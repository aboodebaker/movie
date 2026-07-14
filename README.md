# Recitation Coach

A personal Quran recitation coach that combines three things no existing app ships together:

1. **Match Engine** — listens to your recitation and ranks the qurra whose voice, melodic style, and range genuinely fit *your* voice (timbre + style + range-fit gate).
2. **Live Mimicry Coach** — a QARII-style live practice screen: the matched reciter's pitch contour is projected into your calibrated range and drawn as a lane; your live pitch rides it as a dot with short, kind cues (*a touch low · good — hold it · follow the rise*).
3. **Tutor** — a structured curriculum for maqamat, tajweed (honest, tiered detection), and makharij (minimal-pair drills), sharing the same data spine as the mimicry screen.

Positioning: a **practice multiplier between lessons with a real ustadh** — never a certification of tajweed. Guidance, never grading.

## Documents

| Document | Contents |
|---|---|
| [docs/TECHNICAL_SPECIFICATION.md](docs/TECHNICAL_SPECIFICATION.md) | Full technical spec: architecture, algorithms, data model, API surface, ML components, data pipeline, privacy posture |
| [docs/COSTS.md](docs/COSTS.md) | Verified cost specification (researched and priced July 2026, in ZAR and USD, with sources) |
| [docs/ROADMAP_AND_YOUR_TASKS.md](docs/ROADMAP_AND_YOUR_TASKS.md) | Phase-by-phase build roadmap and the concrete list of things **you** need to do |

## Stack at a glance

- **Client:** Next.js PWA · AudioWorklet mic capture · on-device YIN/McLeod pitch detection (`pitchy`) · canvas lane renderer at 60 fps · later wrapped with Capacitor for app stores
- **API:** FastAPI (Python) — calibration, matching, contour delivery, take scoring, drill scoring, progress
- **ML (all open source, all CPU in the interactive path):** SpeechBrain ECAPA-TDNN speaker embeddings · librosa pYIN / CREPE pitch tracking · CTC forced alignment with Quran-fine-tuned checkpoints (Tarteel et al.) · DTW take review · rule-based maqam detection on fine-grained pitch-class histograms
- **Data:** EveryAyah (per-ayah MP3s) · QUL/qul.tarteel.ai (Uthmani + tajweed-annotated text, word-level timing segments) · Quran.com API · MP3Quran (later corpus expansion)
- **Storage:** Postgres + pgvector (Supabase free tier); reference audio streamed + cached, never hoarded

## Core idea (from QARII, extended)

All pitch maths live in **cents relative to each voice's own anchors**, never raw Hz:

```
c(t)      = 1200 · log2(f(t) / f_ref)                    # cents
anchors   = P15 / P50 / P85 of voiced-frame distribution  # low / mid / high
r(t)      = (c_reciter(t) − mid_r) / (high_r − low_r)     # dimensionless shape
target(t) = mid_user + r(t) · (high_user − low_user)      # his high = your high
```

That one formula drives the match gate, draws the live target lane, and scores takes afterwards.
