# Recitation Coach — Cost Specification

*Researched and verified **13 July 2026**. Exchange rate used: **US$1 ≈ R16.40** (July 2026 average ≈ R16.43). All recurring figures are monthly unless stated.*

> **Headline:** the prototype period (Phases 0–1, first ~month) costs **R0**. A deployed steady state costs **R0–R185/month** depending on one decision — how the FastAPI backend is hosted. The original build document's claim of "under R150/month, R0 for the prototype" is broadly right, with one correction: **Fly.io no longer has a free tier for new accounts**, so the backend is the only line item that genuinely costs money.

---

## 1. What is genuinely free (verified)

| Item | Tool | Cost | Verified detail |
|---|---|---|---|
| ML models | ECAPA-TDNN (SpeechBrain), pYIN/CREPE, librosa, `pitchy`, Quran-tuned ASR checkpoints (`tarteel-ai/whisper-base-ar-quran`, Quranic wav2vec2 phonetic model) | **R0** | All open source / openly hosted on Hugging Face |
| Reference audio & text | EveryAyah (per-ayah MP3s, ~44 reciters), MP3Quran, QUL segment DBs + tajweed script, Quran.com API | **R0** | All live and free; EveryAyah also mirrored on Internet Archive |
| Database + storage | Supabase Free tier | **R0** | 500 MB Postgres (pgvector included), 1 GB file storage, 5 GB egress/month, 50k MAU. Caveat: **project pauses after 1 week without API requests** — resume manually or ping it weekly |
| Frontend hosting | Vercel Hobby or Cloudflare Pages (free tiers) | **R0** | Static/PWA hosting free for personal projects; Cloudflare Pages has no bandwidth cap on static assets |
| Batch GPU | Google Colab free (T4 16 GB, ~15–30 h/week, ≤12 h sessions, not guaranteed) or Kaggle (30 h/week, P100, ≤9 h sessions) | **R0** | More than enough for corpus ingestion and any weekend fine-tuning |

## 2. The one real cost: backend hosting (Phase 2+)

The FastAPI service runs ECAPA embedding, forced alignment, and DTW scoring on CPU. That workload wants **1–2 GB RAM** (the alignment model is the driver), so the ultra-cheap 256 MB instances are not realistic. Verified options:

| Option | Price (USD) | Price (ZAR) | Notes |
|---|---|---|---|
| **Fly.io** shared-cpu-1x · 1 GB, always-on | $5.92 | ≈ R97 | No free tier for new accounts anymore. Egress $0.02/GB (NA/EU regions) — negligible here |
| **Fly.io** shared-cpu-1x · 2 GB, always-on | $11.11 | ≈ R182 | The comfortable choice if alignment runs server-side |
| **Fly.io with auto-stop** (scales to zero between practice sessions) | ~$1–4 | ≈ R16–65 | Billing is per-second; a personal app used ~1 h/day pays a fraction of always-on. Cold start of a few seconds only affects take-scoring, never the live lane (which is on-device) |
| **Railway** Hobby | $5 minimum (includes $5 usage) | ≈ R82 | 30-day trial credit, then no permanent free tier; usage-based beyond $5 |

**Recommendation:** Fly.io 2 GB with auto-stop → realistically **R20–80/month** for single-user usage patterns; budget R182 as the always-on ceiling.

Phases 0–1 need **no backend at all** (Phase 0 is a notebook; Phase 1's live lane is client-only), which is why the prototype period is R0.

## 3. Optional / contingency

| Item | Cost | When |
|---|---|---|
| Spot GPU (impatience option) | RTX 4090 ≈ $0.29–0.39/hr ≈ **R5–7/hr** (Vast.ai interruptible / RunPod Community) | Only if Colab/Kaggle queues frustrate you. Note: cheaper than the original document's ~R20/hr estimate. A full 30-reciter corpus ingestion is a handful of GPU-hours — call it R30–70 once |
| Domain name | ~$10–15/**year** ≈ R165–250/yr (~R14–21/mo equivalent) | Optional vanity; the free `*.vercel.app` / `*.pages.dev` / `*.fly.dev` subdomains work fine |
| Supabase Pro | $25/mo ≈ R410 | Only if you outgrow 500 MB DB / 1 GB storage / want no auto-pause. Not needed while audio is streamed rather than stored; **storing your own practice takes is the likeliest thing to eventually push you here**, so prune old takes or keep them local |
| Local disk for corpus cache | R0 (uses your machine) | ~10–20 GB if you cache a working set of reciters locally during development |

## 4. Cost by phase

| Phase | Duration | Infrastructure needed | Monthly cost |
|---|---|---|---|
| 0 · Proof (notebook ranking test) | 1 weekend | Laptop + Colab/Kaggle | **R0** |
| 1 · QARII moment (client-only live lane) | 2–3 wks | Vercel/CF Pages free | **R0** |
| 2 · Match Engine | 2–3 wks | + Supabase free, + backend | **R0–R182** (R0 if the API only runs locally during dev — legitimate for a single user) |
| 3 · Full mimicry | 3–4 wks | same | R20–182 |
| 4 · Tajweed Tier 1 | 3–4 wks | same | R20–182 |
| 5 · Academy + drills | 4+ wks | same | R20–182 |
| 6 · Polish / steady state | ongoing | same | **R20–182 realistic; ~R100 typical** |

## 5. Steady-state summary

- **Floor (dev-only, API run locally when needed):** **R0/month** — entirely legitimate for a single-user personal tool.
- **Deployed, auto-stop backend:** **~R20–100/month.**
- **Deployed, always-on 2 GB backend + domain:** **~R200/month ceiling.**
- **One-time costs:** R0 required. Optional: ~R30–70 of spot GPU if you skip free Colab for ingestion.

The expensive-*looking* part of this app — the ML — is confirmed to be the cheap part: every interactive model runs on CPU or in the browser, and all model weights and data sources are free.

### Corrections to the original document's §12
1. ~~"Fly.io or Railway small instance: R0–R100/mo"~~ → **Fly.io has no free tier for new accounts (2026); Railway's free tier is a 30-day trial.** Real range R20–182/mo deployed, R0 if run locally.
2. Spot GPU "~R20/hr" → actually **R5–7/hr** at July 2026 marketplace prices (in your favour).
3. Supabase free tier confirmed, but note the **auto-pause after 7 idle days** — harmless for an app you use daily, worth knowing about during slow weeks.

## 6. Sources (accessed 13 July 2026)

- Supabase pricing: [supabase.com/pricing](https://supabase.com/pricing); free-tier details: [uibakery.io/blog/supabase-pricing](https://uibakery.io/blog/supabase-pricing), [designrevision.com/blog/supabase-pricing](https://designrevision.com/blog/supabase-pricing)
- Fly.io machine pricing incl. 1 GB $5.92 / 2 GB $11.11: [fly.io/docs/about/pricing](https://fly.io/docs/about/pricing/); free-tier removal: [expresstech.io](https://expresstech.io/7-fly-io-alternatives-in-2026-real-pricing-after-the-free-tier-died/)
- Railway plans: [docs.railway.com/pricing/plans](https://docs.railway.com/pricing/plans), [railway.com/pricing](https://railway.com/pricing)
- Colab free GPU limits: [research.google.com/colaboratory/faq.html](https://research.google.com/colaboratory/faq.html), [hivenet.com guide](https://www.hivenet.com/post/google-colaboratory-gpu-complete-guide-to-free-cloud-gpu-access-and-limitations); Kaggle 30 h/week: [kaggle.com/docs/efficient-gpu-usage](https://www.kaggle.com/docs/efficient-gpu-usage)
- Spot GPU rates: [vast.ai/pricing](https://vast.ai/pricing), [runpod.io/pricing](https://www.runpod.io/pricing), [synpixcloud comparison](https://www.synpixcloud.com/blog/vast-ai-vs-runpod-rtx-4090-pricing)
- Data sources: [everyayah.com](https://everyayah.com/), [qul.tarteel.ai](https://qul.tarteel.ai/), [github.com/TarteelAI/quranic-universal-library](https://github.com/TarteelAI/quranic-universal-library), [archive.org EveryAyah mirror](https://archive.org/details/quran-everyayah)
- Models: [huggingface.co/tarteel-ai/whisper-base-ar-quran](https://huggingface.co/tarteel-ai/whisper-base-ar-quran), [huggingface.co/tarteel-ai](https://huggingface.co/tarteel-ai)
- USD/ZAR July 2026 (~16.4): [exchange-rates.org history](https://www.exchange-rates.org/exchange-rate-history/usd-zar-2026)
