# Recitation Coach — Technical Specification

*v1 · July 2026 · derived from the build-breakdown document, verified against current tooling and data sources.*

---

## 1. System overview

Three engines share one data spine:

| Engine | Purpose | Runs where |
|---|---|---|
| **Match Engine** | Rank reciters against the user's voice on timbre, melodic style, and range fit | Server (batch features) + pgvector query |
| **Live Mimicry Coach** | QARII-style live lane: target contour + live pitch dot + cue engine | Entirely on-device (browser) |
| **Tutor** | Maqamat curriculum, tajweed rule engine + detectors, makharij drills | Rule engine client-side; acoustic scoring server-side |

Data flow: client records → on-device real-time cues during practice → finished take optionally uploaded → FastAPI runs alignment + DTW + tier scoring → results land in Postgres → review screen renders overlays and per-word chips.

Match path: calibration audio → embeddings + voice profile → pgvector similarity + range gate → ranked reciters.

---

## 2. Architecture

| Layer | Choice | Notes |
|---|---|---|
| Client | **Next.js/React PWA**. AudioWorklet mic capture, canvas lane renderer. Capacitor wrap for app stores later. | Real-time loop is fully client-side, so the server is out of the latency budget. Flutter is the alternative if one mobile codebase from day one is preferred. |
| API | **FastAPI (Python)** | The audio/ML ecosystem is Python. Endpoints in §8. |
| ML runtime | **CPU inference** for ECAPA, pYIN, DTW, alignment. Batch GPU (free Colab/Kaggle) only for corpus ingestion and optional fine-tuning. | Nothing interactive needs a GPU. |
| Storage | **Postgres + pgvector** (Supabase free tier) for profiles, features, embeddings, scores. Supabase object storage for user takes. Reference audio streamed from source CDNs with local caching. | Vector search for matching comes free with pgvector. Do not rehost ~100 GB of audio you don't own. |
| Jobs | Small worker (Celery, or plain cron scripts to start) | Lazy per-surah contour preparation; weekly reports. |

### Scale check
6,236 ayat × 30 reciters ≈ 187k clips, but derived features are tiny: an embedding is 192 floats, a contour a few KB of JSON. The database stays well inside Supabase's free 500 MB even with a large corpus, *provided audio is streamed/cached rather than stored*.

---

## 3. Calibration — the ninety-second voice check

Onboarding records ~90 s in three tasks:

1. Hum/sustain a comfortable tone, then glide gently up to a soft ceiling and down to a floor.
2. Recite Al-Fatihah naturally.
3. Recite 2–3 assigned short ayat chosen to cover a spread of letters (doubles as the makharij baseline).

Stored **voice profile**:
- Comfortable band: **P15–P85 of the voiced-frame cent distribution**, plus absolute limits and median.
- 192-dim ECAPA timbre embedding (averaged over the recited ayat).
- Initial style vector (§4, same features as reciters).

Operational rules: same phone mic, quiet room, and **re-run calibration monthly** — a teenage voice still shifts, and a stale profile silently mis-draws every target lane.

---

## 4. Match Engine — three independent axes

Never collapse "sounds like me" into one score. Compute three, blend with a user-adjustable weight slider ("match my voice" ⇄ "match my style"), with range fit always enforced as a hard gate.

| Axis | Captures | Computation |
|---|---|---|
| **Timbre** | Vocal colour — does he *sound* like you | ECAPA-TDNN speaker embeddings (SpeechBrain `speechbrain/spkrec-ecapa-voxceleb`, 192-dim, ~0.1 s/utterance on CPU). Average user embedding over several ayat; compare to per-reciter mean embeddings by cosine similarity. Always compare recitation-to-recitation (same domain). |
| **Melodic style** | How he *moves* — contour shapes, ornament density, pace, pauses, preferred maqamat | Style vector per reciter: interval histogram in cents, rise/fall shape stats (DTW distance on normalised contours), syllable rate, pause-length distribution, madd stretch tendency, maqam usage distribution. Weighted distance. |
| **Range fit** | Can your voice physically live where his melody lives | Express his contour span in semitones around his own median; map onto the user's calibrated band; pass iff it stays inside comfortable limits (+ small stretch allowance). **Fail → excluded regardless of other scores.** |

### The range-mapping formula (used everywhere)

```
c(t)      = 1200 · log2(f(t) / f_ref)                     # everything in cents
low, mid, high = P15, P50, P85 of voiced-frame cents      # per singer
r(t)      = (c_r(t) − mid_r) / (high_r − low_r)           # reciter shape, dimensionless
target(t) = mid_u + r(t) · (high_u − low_u)               # projected into the user's voice
```

This single formula implements "his high is your high", drives the match gate, draws the target lane, and scores attempts. All contour comparison (DTW, deviation stats) happens on these normalised curves. **Never compare raw Hz.**

---

## 5. Live Mimicry Coach

A horizontally scrolling lane. Gold line ahead of the playhead = reciter's contour projected into the user's range. Live pitch = a dot riding (or drifting off) the line. Above: the ayah in Uthmani script scrolling right-to-left, current word highlighted (word boundaries from QUL segments). Below: one short cue at a time.

### 5.1 Offline preparation (server, lazy, once per reciter-ayah)
1. Pitch-track reference audio: **pYIN via librosa** by default, **CREPE** where source quality is poor.
2. Smooth: median filter + light low-pass. Keep a voiced/unvoiced mask.
3. Convert to cents; normalise to the reciter's own anchors.
4. Attach word boundaries: QUL segment databases where available; forced alignment otherwise (§7.2).
5. Store as compact JSON contour, fetchable in one request. **Precompute lazily per surah on first use** — never crunch 187k clips up front.

### 5.2 Real-time loop (entirely on-device)
- Mic via **AudioWorklet**.
- Lightweight pitch detector: YIN / McLeod (the **`pitchy`** npm library; same algorithm in Swift/Kotlin later), ~40 ms windows, 10–20 ms hop.
- Convert to cents against the stored profile; render dot on canvas at 60 fps.
- **Latency budget: voice → visual under 100 ms.**
- Nothing uploads during practice. Only the finished take is *optionally* uploaded for detailed scoring.

### 5.3 Cue engine — guidance, never grading

| State | Condition (vs target, cents) | Cue |
|---|---|---|
| On the line | \|error\| ≤ 60 sustained ≥ 300 ms | *good — hold it* |
| Slightly off | 60 < \|error\| ≤ 150 | *a touch low / a touch high* |
| Off the lane | \|error\| > 150 sustained | *too low / too high* |
| Change coming | target slope in 0.5–1.0 s lookahead exceeds threshold | *follow the rise / ease down* |
| Stretch point | madd region reached (tajweed markup, §7.6) | *stretch — 4 counts* |
| Stop mark | waqf approaching | *prepare to stop* |

Rules: at most one cue on screen; short, single, kind wording; thresholds tuned per user from calibration variance so a naturally wobbly voice isn't nagged. The last two rows are where this app passes QARII: the tajweed rule engine knows where every madd and waqf falls, so melodic and correctness cues share one lane.

### 5.4 Practice modes
- **Shadow mode (default, easiest):** reciter plays (volume down to muted) while you recite along; lane scrolls on his clock, so word sync is free.
- **Solo mode:** you recite alone; afterwards DTW (anchored at word boundaries) aligns your take to the reference; review shows your green contour over his gold, with per-word chips (*timing off, pitch flat, madd short*) — tap a chip to hear both versions of just that word. Post-hoc scoring deliberately sidesteps real-time alignment to an unheard recitation; live solo word-tracking via streaming ASR is a later upgrade.

---

## 6. Data layer

| Source | Provides | Role | Verified July 2026 |
|---|---|---|---|
| **EveryAyah.com** | Per-ayah MP3s, ~44 well-known qurra, mostly 128 kbps | Backbone corpus — segmentation already done; ideal for Phases 0–3 | Live; also mirrored on Internet Archive (~98 GB collections) as a backup source |
| **MP3Quran.net** | Full-surah audio, several hundred reciters | Corpus expansion once auto-segmentation works | Live |
| **QUL (qul.tarteel.ai) + Quran.com API** | Uthmani text, translations, tajweed-annotated (colour-coded) script, ayah- and word-level timing segment DBs for multiple recitations, SQLite/JSON downloads | Word highlighting, madd/waqf positions for the cue engine, tajweed rule engine ground truth | Live; open-source (github.com/TarteelAI/quranic-universal-library) |
| **User recordings** | Calibration, practice takes, drill clips | Profile, progress history, personal baseline | — |

**Ingestion pipeline per clip:** download → loudness-normalise (ffmpeg loudnorm) → resample 16 kHz mono → pitch track → speaker embedding → style features → features into Postgres (embeddings in pgvector). Audio streamed from source CDN and cached, not hoarded.

**Licensing:** these recitations are distributed free for religious use — fine for a personal build. If the app ever goes public, re-read each source's redistribution terms; prefer streaming-with-attribution over rehosting.

---

## 7. ML components

### 7.1 Speaker embeddings (timbre)
SpeechBrain pretrained **ECAPA-TDNN** (`spkrec-ecapa-voxceleb`), 192-dim, ~0.1 s per utterance on CPU. Trained on speech, not melodic recitation, so: average over many ayat, and only ever compare recitation to recitation. If Phase-0 matches feel off, the upgrade is fine-tuning the embedder on reciter-labelled clips from the corpus — a weekend job later, not a blocker.

### 7.2 Alignment (audio ↔ words ↔ phonemes)
Powers word highlighting, DTW anchors, madd measurement, per-letter feedback. Ladder:

1. **QUL word-level segments** where they exist for the chosen reciter — zero ML.
2. **CTC forced alignment** against the known ayah text using Quran-fine-tuned checkpoints — the workhorse. Verified available on Hugging Face: `tarteel-ai/whisper-base-ar-quran` (+ tiny variant), community Whisper LoRAs (test WER ≈ 6%), and a Quranic **wav2vec2 phonetic** checkpoint (phoneme-level output — exactly what GOP scoring in 7.6/7.7 needs). Use a CTC-based model (wav2vec2) for alignment proper; Whisper variants for transcription-style checks.
3. **Montreal Forced Aligner** with Arabic models as fallback — expect to adapt its dictionary, since Quranic pronunciation differs from MSA.

Knowing the exact text in advance makes this *constrained* alignment — far easier than open transcription.

### 7.3 Pitch tracking
Offline: pYIN (librosa) default, CREPE for noisy sources. Real-time: YIN/McLeod in an AudioWorklet (§5.2). Store everything in cents with a voiced/unvoiced mask so consonants and silence don't pollute contour statistics.

### 7.4 Take review (solo scoring)
DTW on normalised cent contours (`librosa.sequence.dtw`), **anchored at word boundaries** so a slow first word can't smear the alignment. Per-word outputs: timing deviation, mean pitch error, direction agreement (did you rise where he rose), madd length ratio vs the reciter's own harakah baseline, missed/added stops. Rendered as overlay + chips (§5.4).

### 7.5 Maqam identification (mind the quarter tones)
The seven maqamat of tilawah — Bayati, Rast, Hijaz, Saba, Nahawand, Sikah, Ajam — include ~quarter-tone intervals, so 12-semitone Western chroma is blind to exactly the distinctions that matter (Rast and Sikah live on neutral thirds). Method: fold the cent-valued track into one octave at **10–20 cent resolution** (fine-grained pitch-class histogram), estimate the tonic, template-match against the seven scale profiles. Rule-based is enough to say "this ayah is Bayati" and power the academy; a learned classifier on labelled clips is a later refinement. Also detect maqam *changes* across a surah — good reciters modulate, and showing where is itself a lesson.

### 7.6 Tajweed detection — honest difficulty tiers
Design principle: **tajweed rules are deterministic from the annotated text.** QUL's tajweed-marked script says exactly where each rule applies; the symbolic rule engine always knows what *should* happen, and the acoustic models only verify whether it *did*. Detecting a known madd at a known timestamp is vastly easier than discovering tajweed events blind.

| Tier | Rules | Method | Reliability |
|---|---|---|---|
| **1 — build now** | Madd lengths (2 / 4–5 / 6 counts), waqf & ibtida placement, qalqalah on ق ط ب ج د, overall pace | Signal + alignment: vowel duration vs the reciter's own harakah unit; pause detection vs stop marks; release-burst energy for qalqalah | **High** — duration and energy measurements |
| **2 — with a phoneme model** | Ghunnah presence/length on م ن; tafkhim vs tarqiq; ikhfa–idgham–izhar–iqlab contexts | Rule engine flags context from text; GOP-style scoring (posterior of expected phoneme from the CTC model) + targeted acoustics (nasal energy, formant structure) | **Medium** — useful feedback, occasional false flags; phrase cues softly |
| **3 — defer** | Fine sifat, subtle makharij confusions inside fluent recitation | Open research; even funded apps don't do this reliably. Cover via isolated drills (7.7) + a human teacher | **Low** — do not promise it |

### 7.7 Makharij drills — where per-letter feedback is actually reliable
Free recitation is the hardest place to judge articulation; isolated words are the easiest. Run short drills on the classic minimal pairs: س/ص، ت/ط، ه/ح، أ/ع، ك/ق، ذ/ز/ظ، د/ض. Flow: hear the reciter's word → see the articulation-point diagram → record → the phoneme model's confidence for the intended letter vs its confusable twin is the score. These wrong-letter detections are trustworthy in a way Tier-3 free-recitation judgements are not. Drill results feed a weekly makharij report.

---

## 8. API surface (FastAPI)

| Endpoint | Purpose |
|---|---|
| `POST /calibrate` | Upload calibration audio → voice profile (anchors, embedding, style vector) |
| `GET /match` | Ranked reciters: pgvector cosine on timbre + style distance + range gate; accepts weight-slider param |
| `GET /contour/{reciter}/{surah}/{ayah}` | Compact JSON contour + word boundaries + tajweed markup (triggers lazy prep on miss) |
| `POST /takes/score` | Solo-mode take → DTW review + Tier-1/2 tajweed results |
| `POST /drills/score` | Makharij drill clip → GOP confusable-pair score |
| `GET /progress` | Mastery map (per-ayah × 114 surahs), streaks, weekly report data |

## 9. Data model (Postgres + pgvector)

```
reciters(id, name, style_vector jsonb, mean_embedding vector(192), anchors jsonb)
clips(id, reciter_id, surah, ayah, source_url, duration, features_ready bool)
contours(clip_id, contour_json jsonb, word_boundaries jsonb, tajweed_marks jsonb)
user_profile(id, anchors jsonb, embedding vector(192), style_vector jsonb, calibrated_at)
takes(id, surah, ayah, reciter_id, mode, audio_path, created_at)
take_scores(take_id, per_word jsonb, summary jsonb)
mastery(surah, ayah, level, last_practised)
drills(id, pair, word, score, created_at)
```

## 10. Privacy (POPIA-aware from day one)

Voice recordings are **biometric data** (special personal information under POPIA) and recitation additionally reveals religious practice — sensitive on two counts even with a single user. Posture, baked in from day one because it's costless now and painful to retrofit:

- Real-time analysis on-device by default; **explicit opt-in** before any take uploads.
- Encryption at rest (Supabase default) + a working **delete-everything** button.
- No training on user audio without separate consent.

## 11. Honest limits

1. **No app certifies tajweed.** Recitation is transmitted by talaqqi — face to face with a qualified teacher. Subtle makharij/sifat errors will slip past any model; Tier 3 is deferred, not faked. The app is a practice multiplier between lessons with a real ustadh.
2. **Full automated tajweed grading is research-grade.** Even well-funded products constrain their claims; credibility depends on the §7.6 tiering.
3. **Recording conditions fool models.** Same mic, same quiet room, recalibrate monthly.

## 12. Competitive landscape (why this synthesis is novel)

| Product | Does | Gap this app fills |
|---|---|---|
| QARII (qarii.net, invite-only beta) | Range-calibrated live melodic guidance; explicitly defers tajweed/pronunciation | Its practice screen **plus** the correctness layer it postponed, in one place |
| QariAI | Per-letter tajweed feedback, gamified | No voice/range matching, no melodic mimicry lane |
| Qarify | Live pitch curve vs a chosen qari | Qari is user-picked, not voice-matched; no tajweed/makharij/maqamat layer |
| Tarteel | Recitation-aware memorisation, mistake detection | Hifz-focused; not a melody or style coach |
