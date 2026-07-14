/**
 * Melodic-style features (spec §4 "Melodic style" axis), computed identically
 * for a reciter (pooled across several ayat) and for the user (one longer
 * recording) so the two are directly comparable in scoring.ts.
 *
 * Everything here operates on cent series already produced elsewhere
 * (@/lib/contour/extract for reciters, @/lib/audio/micPitch readings for the
 * user) — never on raw Hz or raw audio.
 */
import { percentile } from "@/lib/pitch/cents";

export interface PauseStats {
  /** Mean length of qualifying pauses, ms. */
  meanMs: number;
  /** Pauses per second of recording — "how often does he breathe/stop". */
  ratePerSec: number;
  count: number;
}

export interface StyleVector {
  /** 16-bin histogram (±400 cents clamped) of ~100ms-spaced frame-to-frame
   * deltas, normalised to sum to 1. */
  intervalHist: number[];
  /** Pooled P85 − P15 of voiced cents. Informational — not weighted into
   * the style score (range fit already covers range; this is just useful
   * to display/debug). */
  spanCents: number;
  voicedRatio: number;
  pauseStats: PauseStats;
  /** Mean |delta| per ~100ms sample, in cents — ornament/movement density. */
  movement: number;
  totalDurationSec: number;
}

export const HIST_BINS = 16;
const HIST_CLAMP = 400; // cents
const HIST_BIN_WIDTH = (2 * HIST_CLAMP) / HIST_BINS;
const PAUSE_MIN_MS = 150;

/**
 * Mutable accumulator, pooled across multiple ayat (reciter) or fed once
 * with a single long recording (user). Two passes over the data:
 *  - addSeries: full-resolution voiced/unvoiced bookkeeping (voicedRatio,
 *    pooled cents for spanCents, internal pause gaps).
 *  - addResampledDeltas: a ~100ms-spaced series for interval histogram +
 *    movement, per the spec's "sample at ~100ms spacing" instruction.
 */
export class StyleAccumulator {
  histCounts = new Array<number>(HIST_BINS).fill(0);
  deltaAbsSum = 0;
  deltaCount = 0;
  pauseDurationsMs: number[] = [];
  totalDurationSec = 0;
  totalFrames = 0;
  voicedFrames = 0;
  pooledVoicedCents: number[] = [];

  /**
   * Full-resolution pass over one ayah's (or the user's) contour. Only
   * unvoiced runs bounded by voiced frames on both sides count as "pauses" —
   * leading/trailing silence is just recording slack, not a breath.
   */
  addSeries(timesSec: number[], cents: (number | null)[]): void {
    this.totalFrames += cents.length;
    let runStart = -1; // index of the last voiced frame before the current gap
    for (let i = 0; i < cents.length; i++) {
      const v = cents[i];
      if (v !== null) {
        this.voicedFrames++;
        this.pooledVoicedCents.push(v);
        if (runStart !== -1) {
          const gapMs = (timesSec[i] - timesSec[runStart]) * 1000;
          if (gapMs >= PAUSE_MIN_MS) this.pauseDurationsMs.push(gapMs);
          runStart = -1;
        }
      } else if (runStart === -1 && i > 0 && cents[i - 1] !== null) {
        runStart = i - 1;
      }
    }
    if (timesSec.length > 1) {
      this.totalDurationSec += timesSec[timesSec.length - 1] - timesSec[0];
    }
  }

  /** Interval/movement pass on an already ~100ms-spaced (resampled) series. */
  addResampledDeltas(resampled: (number | null)[]): void {
    for (let i = 1; i < resampled.length; i++) {
      const a = resampled[i - 1];
      const b = resampled[i];
      if (a === null || b === null) continue;
      const raw = b - a;
      const clamped = Math.max(-HIST_CLAMP, Math.min(HIST_CLAMP, raw));
      const bin = Math.min(
        HIST_BINS - 1,
        Math.floor((clamped + HIST_CLAMP) / HIST_BIN_WIDTH),
      );
      this.histCounts[bin]++;
      this.deltaAbsSum += Math.abs(clamped);
      this.deltaCount++;
    }
  }

  finalize(): StyleVector {
    const histTotal = this.histCounts.reduce((a, b) => a + b, 0);
    const intervalHist =
      histTotal > 0
        ? this.histCounts.map((c) => c / histTotal)
        : new Array(HIST_BINS).fill(1 / HIST_BINS);

    const spanCents =
      this.pooledVoicedCents.length > 1
        ? percentile(this.pooledVoicedCents, 85) - percentile(this.pooledVoicedCents, 15)
        : 0;

    const meanMs =
      this.pauseDurationsMs.length > 0
        ? this.pauseDurationsMs.reduce((a, b) => a + b, 0) / this.pauseDurationsMs.length
        : 0;
    const ratePerSec =
      this.totalDurationSec > 0 ? this.pauseDurationsMs.length / this.totalDurationSec : 0;

    return {
      intervalHist,
      spanCents,
      voicedRatio: this.totalFrames > 0 ? this.voicedFrames / this.totalFrames : 0,
      pauseStats: { meanMs, ratePerSec, count: this.pauseDurationsMs.length },
      movement: this.deltaCount > 0 ? this.deltaAbsSum / this.deltaCount : 0,
      totalDurationSec: this.totalDurationSec,
    };
  }
}

/** Reciter contour: resample to ~100ms spacing by taking every Nth frame. */
export function resampleContour(hopSec: number, cents: (number | null)[]): (number | null)[] {
  const n = Math.max(1, Math.round(0.1 / hopSec));
  const out: (number | null)[] = [];
  for (let i = 0; i < cents.length; i += n) out.push(cents[i]);
  return out;
}

/** User mic readings (~60/s): resample to ~100ms spacing by taking every 6th reading. */
export function resampleReadings(cents: (number | null)[]): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < cents.length; i += 6) out.push(cents[i]);
  return out;
}
