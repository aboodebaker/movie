"use client";

import { PitchDetector } from "pitchy";
import { hzToCents } from "@/lib/pitch/cents";

/** One live pitch reading from the microphone. */
export interface PitchReading {
  /** ms since tracking started (performance.now() based) */
  tMs: number;
  /** detected fundamental in Hz, or null if unvoiced/unclear */
  hz: number | null;
  /** cents vs F_REF, or null if unvoiced */
  cents: number | null;
  /** pitchy clarity 0..1 */
  clarity: number;
  /** RMS level 0..~1, for a simple level meter */
  level: number;
}

export interface MicPitchTracker {
  stop: () => void;
  sampleRate: number;
  /** The live mic stream — share this with MediaRecorder instead of opening
   *  a second getUserMedia (phones often silence the first stream when a
   *  second one grabs the mic). */
  stream: MediaStream;
}

const FRAME_SIZE = 2048; // ~46 ms at 44.1 kHz — inside the <100 ms budget
// Phone mics are quiet and recitation is melodic, not clean speech — keep
// these permissive or real voices read as "unvoiced".
const CLARITY_THRESHOLD = 0.8;
const MIN_LEVEL = 0.0025;
const MIN_HZ = 60;
const MAX_HZ = 800;

/**
 * Start tracking pitch from the microphone. Calls `onReading` on every
 * animation frame (~60 Hz). Entirely on-device; no audio leaves the browser.
 *
 * Uses an AnalyserNode polled via requestAnimationFrame with a McLeod-method
 * detector (pitchy). Latency ≈ frame size (46 ms) + one paint — comfortably
 * under the 100 ms voice→visual budget from the spec (§5.2).
 */
export async function startMicPitch(
  onReading: (r: PitchReading) => void,
  existingStream?: MediaStream,
): Promise<MicPitchTracker> {
  // echoCancellation ON is essential in shadow mode: without it the mic
  // hears the reciter's playback from the phone speaker and the detector
  // tracks *his* pitch instead of the user's. autoGainControl helps quiet
  // phone mics clear the level threshold; noiseSuppression stays off since
  // it can distort sustained melodic tones.
  const stream =
    existingStream ??
    (await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: true,
      },
    }));

  const ctx = new AudioContext();
  await ctx.resume();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = FRAME_SIZE;
  source.connect(analyser);

  const detector = PitchDetector.forFloat32Array(FRAME_SIZE);
  const buf = new Float32Array(FRAME_SIZE);
  const t0 = performance.now();
  let rafId = 0;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    analyser.getFloatTimeDomainData(buf);

    let sumSq = 0;
    for (let i = 0; i < buf.length; i++) sumSq += buf[i] * buf[i];
    const level = Math.sqrt(sumSq / buf.length);

    const [hz, clarity] = detector.findPitch(buf, ctx.sampleRate);
    const voiced =
      clarity >= CLARITY_THRESHOLD && hz >= MIN_HZ && hz <= MAX_HZ && level > MIN_LEVEL;

    onReading({
      tMs: performance.now() - t0,
      hz: voiced ? hz : null,
      cents: voiced ? hzToCents(hz) : null,
      clarity,
      level,
    });
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  return {
    sampleRate: ctx.sampleRate,
    stream,
    stop: () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      source.disconnect();
      // A caller-supplied stream stays alive (they own it — e.g. a
      // MediaRecorder may still be writing from it).
      if (!existingStream) stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}
