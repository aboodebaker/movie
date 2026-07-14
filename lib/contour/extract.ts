"use client";

import { PitchDetector } from "pitchy";
import { computeAnchors, hzToCents, type Anchors } from "@/lib/pitch/cents";

/**
 * Reference pitch contour of one ayah, extracted client-side from the decoded
 * audio (Phase 1 does the "offline preparation" of spec §5.1 in the browser;
 * a server pipeline with pYIN takes over in Phase 3).
 */
export interface Contour {
  /** hop between frames, seconds */
  hopSec: number;
  /** frame times, seconds from clip start */
  times: number[];
  /** cents vs F_REF per frame; null where unvoiced */
  cents: (number | null)[];
  /** the reciter's own anchors computed from this clip's voiced frames */
  anchors: Anchors;
  durationSec: number;
}

const FRAME_SIZE = 2048;
const HOP_SIZE = 512; // ~12 ms at 44.1 kHz
const CLARITY_THRESHOLD = 0.9;
const MIN_HZ = 60;
const MAX_HZ = 800;
const MEDIAN_WINDOW = 5;

/** Median-smooth a sparse (nullable) series, preserving unvoiced gaps. */
function medianSmooth(values: (number | null)[], w: number): (number | null)[] {
  const half = Math.floor(w / 2);
  return values.map((v, i) => {
    if (v === null) return null;
    const window: number[] = [];
    for (let j = i - half; j <= i + half; j++) {
      const x = values[j];
      if (j >= 0 && j < values.length && x !== null) window.push(x);
    }
    window.sort((a, b) => a - b);
    return window[Math.floor(window.length / 2)];
  });
}

/** Drop voiced islands shorter than minFrames (octave-error blips). */
function dropShortIslands(
  values: (number | null)[],
  minFrames: number,
): (number | null)[] {
  const out = [...values];
  let start = -1;
  for (let i = 0; i <= out.length; i++) {
    const voiced = i < out.length && out[i] !== null;
    if (voiced && start === -1) start = i;
    if (!voiced && start !== -1) {
      if (i - start < minFrames) for (let j = start; j < i; j++) out[j] = null;
      start = -1;
    }
  }
  return out;
}

/**
 * Extract a smoothed cent contour from a decoded AudioBuffer.
 * Runs in ~a second for a typical ayah clip on a phone.
 */
export function extractContour(buffer: AudioBuffer): Contour {
  const sr = buffer.sampleRate;
  const mono = buffer.getChannelData(0);
  const detector = PitchDetector.forFloat32Array(FRAME_SIZE);
  const frame = new Float32Array(FRAME_SIZE);

  const times: number[] = [];
  let cents: (number | null)[] = [];

  for (let start = 0; start + FRAME_SIZE <= mono.length; start += HOP_SIZE) {
    frame.set(mono.subarray(start, start + FRAME_SIZE));
    const [hz, clarity] = detector.findPitch(frame, sr);
    const voiced = clarity >= CLARITY_THRESHOLD && hz >= MIN_HZ && hz <= MAX_HZ;
    times.push((start + FRAME_SIZE / 2) / sr);
    cents.push(voiced ? hzToCents(hz) : null);
  }

  cents = medianSmooth(cents, MEDIAN_WINDOW);
  cents = dropShortIslands(cents, 4);

  const voicedCents = cents.filter((c): c is number => c !== null);
  const anchors = computeAnchors(voicedCents);

  return {
    hopSec: HOP_SIZE / sr,
    times,
    cents,
    anchors,
    durationSec: buffer.duration,
  };
}

/** Contour value at an arbitrary time, or null in unvoiced regions. */
export function contourAt(contour: Contour, tSec: number): number | null {
  if (contour.times.length === 0) return null;
  const idx = Math.round((tSec - contour.times[0]) / contour.hopSec);
  if (idx < 0 || idx >= contour.cents.length) return null;
  return contour.cents[idx];
}
