"use client";

/**
 * Reciter-side features for the Match Engine (spec §4): fetch + decode +
 * extractContour every Al-Fatihah ayah for all four reciters, pool the
 * voiced cents into anchors + a P5/P95 extent (range gate) and a style
 * vector (melodic style), and cache the result in localStorage — this is a
 * few dozen network fetches + client-side pitch tracking, not something to
 * redo on every visit.
 */
import { RECITERS, SURAHS, ayahAudioUrl } from "@/data/surahs";
import { extractContour } from "@/lib/contour/extract";
import { computeAnchors, percentile, type Anchors } from "@/lib/pitch/cents";
import { StyleAccumulator, resampleContour, type StyleVector } from "./styleVector";

const FATIHAH = SURAHS.find((s) => s.number === 1)!;

export interface ReciterFeatures {
  reciterId: string;
  /** P15/P50/P85 of pooled voiced cents — his own comfortable band. */
  anchors: Anchors;
  /** P5 of pooled voiced cents — full extent, not just the comfort band. */
  extentLow: number;
  /** P95 of pooled voiced cents. */
  extentHigh: number;
  style: StyleVector;
}

export interface ReciterFeatureSet {
  version: number;
  computedAt: string;
  reciters: Record<string, ReciterFeatures>;
}

// Bump when the feature computation changes shape/semantics so stale caches
// from an older formula don't silently drive scoring.
const STORAGE_KEY = "recitation-coach:match-reciter-features";
const VERSION = 1;

export function loadCachedFeatures(): ReciterFeatureSet | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReciterFeatureSet;
    if (parsed.version !== VERSION) return null;
    if (RECITERS.some((r) => !parsed.reciters[r.id])) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveFeatures(set: ReciterFeatureSet): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(set));
  } catch {
    // Best-effort cache (e.g. quota exceeded) — analysis just reruns next time.
  }
}

export interface AnalysisProgress {
  reciterName: string;
  /** 1-based ayah index within the current reciter. */
  ayahIndex: number;
  ayahCount: number;
  overallDone: number;
  overallTotal: number;
}

/**
 * Build (or return cached) style features for all four reciters from the
 * seven Al-Fatihah ayat. Fetches sequentially (one ayah at a time) so the
 * progress UI can show exactly which clip is being analysed.
 */
export async function computeReciterFeatures(
  onProgress: (p: AnalysisProgress) => void,
): Promise<ReciterFeatureSet> {
  const cached = loadCachedFeatures();
  if (cached) return cached;

  const ctx = new AudioContext();
  const ayat = FATIHAH.ayat;
  const total = RECITERS.length * ayat.length;
  let done = 0;
  const reciters: Record<string, ReciterFeatures> = {};

  try {
    for (const reciter of RECITERS) {
      const acc = new StyleAccumulator();
      for (let ai = 0; ai < ayat.length; ai++) {
        onProgress({
          reciterName: reciter.name,
          ayahIndex: ai + 1,
          ayahCount: ayat.length,
          overallDone: done,
          overallTotal: total,
        });
        const ayah = ayat[ai];
        const res = await fetch(ayahAudioUrl(reciter.id, ayah.surah, ayah.ayah));
        if (!res.ok) {
          throw new Error(
            `Couldn't fetch ${reciter.name}'s ${ayah.surah}:${ayah.ayah} (${res.status}).`,
          );
        }
        const arrayBuffer = await res.arrayBuffer();
        const buffer = await ctx.decodeAudioData(arrayBuffer);
        const contour = extractContour(buffer);
        acc.addSeries(contour.times, contour.cents);
        acc.addResampledDeltas(resampleContour(contour.hopSec, contour.cents));
        done++;
      }

      const pooled = acc.pooledVoicedCents;
      reciters[reciter.id] = {
        reciterId: reciter.id,
        anchors: computeAnchors(pooled),
        extentLow: pooled.length > 1 ? percentile(pooled, 5) : 0,
        extentHigh: pooled.length > 1 ? percentile(pooled, 95) : 0,
        style: acc.finalize(),
      };
    }
    onProgress({
      reciterName: RECITERS[RECITERS.length - 1].name,
      ayahIndex: ayat.length,
      ayahCount: ayat.length,
      overallDone: total,
      overallTotal: total,
    });
  } finally {
    void ctx.close();
  }

  const set: ReciterFeatureSet = {
    version: VERSION,
    computedAt: new Date().toISOString(),
    reciters,
  };
  saveFeatures(set);
  return set;
}
