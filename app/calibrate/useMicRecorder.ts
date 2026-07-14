"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  startMicPitch,
  type MicPitchTracker,
  type PitchReading,
} from "@/lib/audio/micPitch";

export type MicPermissionState = "idle" | "requesting" | "granted" | "denied";

export type RecorderStatus = "idle" | "recording" | "stopped";

export interface RecorderStats {
  status: RecorderStatus;
  /** ms since this recording started (from the latest reading). */
  elapsedMs: number;
  /** cumulative ms of voiced (pitched) audio captured. */
  voicedMs: number;
  voicedFrameCount: number;
  totalFrameCount: number;
  current: PitchReading | null;
}

export interface VoicedSample {
  tMs: number;
  cents: number;
}

const INITIAL_STATS: RecorderStats = {
  status: "idle",
  elapsedMs: 0,
  voicedMs: 0,
  voicedFrameCount: 0,
  totalFrameCount: 0,
  current: null,
};

/**
 * Wraps @/lib/audio/micPitch for one calibration step: starts/stops a mic
 * pitch tracker, accumulates voiced (cents !== null) samples, and exposes
 * live stats for the feedback strip. A fresh recording clears prior samples.
 */
export function useMicRecorder() {
  const [permission, setPermission] = useState<MicPermissionState>("idle");
  const [stats, setStats] = useState<RecorderStats>(INITIAL_STATS);

  const trackerRef = useRef<MicPitchTracker | null>(null);
  const voicedRef = useRef<VoicedSample[]>([]);
  const lastTMsRef = useRef<number | null>(null);

  const start = useCallback(async () => {
    setPermission("requesting");
    voicedRef.current = [];
    lastTMsRef.current = null;
    try {
      const tracker = await startMicPitch((r) => {
        const last = lastTMsRef.current;
        const dt = last === null ? 0 : Math.max(0, Math.min(r.tMs - last, 100));
        lastTMsRef.current = r.tMs;
        const voiced = r.cents !== null;
        if (voiced) voicedRef.current.push({ tMs: r.tMs, cents: r.cents as number });

        setStats((prev) => ({
          status: "recording",
          elapsedMs: r.tMs,
          voicedMs: prev.voicedMs + (voiced ? dt : 0),
          voicedFrameCount: prev.voicedFrameCount + (voiced ? 1 : 0),
          totalFrameCount: prev.totalFrameCount + 1,
          current: r,
        }));
      });
      trackerRef.current = tracker;
      setPermission("granted");
      setStats({ ...INITIAL_STATS, status: "recording" });
    } catch {
      trackerRef.current = null;
      setPermission("denied");
      setStats(INITIAL_STATS);
    }
  }, []);

  const stop = useCallback(() => {
    trackerRef.current?.stop();
    trackerRef.current = null;
    setStats((prev) => (prev.status === "recording" ? { ...prev, status: "stopped" } : prev));
  }, []);

  const reset = useCallback(() => {
    trackerRef.current?.stop();
    trackerRef.current = null;
    voicedRef.current = [];
    lastTMsRef.current = null;
    setStats(INITIAL_STATS);
  }, []);

  // Never leave the mic open if the step unmounts mid-recording.
  useEffect(() => {
    return () => {
      trackerRef.current?.stop();
      trackerRef.current = null;
    };
  }, []);

  const getVoicedReadings = useCallback((): VoicedSample[] => voicedRef.current.slice(), []);
  const getVoicedCents = useCallback((): number[] => voicedRef.current.map((v) => v.cents), []);

  return { permission, stats, start, stop, reset, getVoicedReadings, getVoicedCents };
}
