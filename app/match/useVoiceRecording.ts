"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startMicPitch, type MicPitchTracker, type PitchReading } from "@/lib/audio/micPitch";

export type MicPermissionState = "idle" | "requesting" | "granted" | "denied";
export type RecordingStatus = "idle" | "recording" | "stopped";

export interface RecordingStats {
  status: RecordingStatus;
  elapsedMs: number;
  voicedMs: number;
  current: PitchReading | null;
}

/** One reading of the user's recording: cents is null in unvoiced frames. */
export interface CentsSample {
  tMs: number;
  cents: number | null;
}

const INITIAL_STATS: RecordingStats = {
  status: "idle",
  elapsedMs: 0,
  voicedMs: 0,
  current: null,
};

const RECORDER_MIME_CANDIDATES = ["audio/webm", "audio/mp4", "audio/ogg"];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return RECORDER_MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
}

/**
 * Records the user's own recitation for the Match Engine's style vector:
 * a full-resolution pitch reading stream (via @/lib/audio/micPitch, kept
 * whole — including unvoiced gaps — so pause stats can be built from it)
 * plus a parallel MediaRecorder capture so the take can be played back for
 * an A/B comparison against each reciter.
 *
 * Uses two independent getUserMedia calls (one inside startMicPitch, one
 * here for MediaRecorder) rather than sharing a stream, so this stays a
 * thin wrapper around the existing mic-pitch lib instead of reimplementing
 * it. Browsers reuse the already-granted permission silently for the
 * second call.
 */
export function useVoiceRecording() {
  const [permission, setPermission] = useState<MicPermissionState>("idle");
  const [stats, setStats] = useState<RecordingStats>(INITIAL_STATS);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  const trackerRef = useRef<MicPitchTracker | null>(null);
  const readingsRef = useRef<CentsSample[]>([]);
  const lastTMsRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = useCallback(async () => {
    setPermission("requesting");
    setAudioBlob(null);
    readingsRef.current = [];
    lastTMsRef.current = null;
    chunksRef.current = [];

    try {
      const tracker = await startMicPitch((r) => {
        const last = lastTMsRef.current;
        const dt = last === null ? 0 : Math.max(0, Math.min(r.tMs - last, 100));
        lastTMsRef.current = r.tMs;
        readingsRef.current.push({ tMs: r.tMs, cents: r.cents });

        setStats((prev) => ({
          status: "recording",
          elapsedMs: r.tMs,
          voicedMs: prev.voicedMs + (r.cents !== null ? dt : 0),
          current: r,
        }));
      });
      trackerRef.current = tracker;
      setPermission("granted");
      setStats({ ...INITIAL_STATS, status: "recording" });

      // Best-effort: A/B playback is a nice-to-have, so a failure here
      // shouldn't stop the pitch-tracked recording above.
      try {
        const mimeType = pickMimeType();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
          setAudioBlob(new Blob(chunksRef.current, { type: mimeType ?? "audio/webm" }));
        };
        recorder.start();
        mediaRecorderRef.current = recorder;
      } catch {
        mediaRecorderRef.current = null;
      }
    } catch {
      trackerRef.current = null;
      setPermission("denied");
      setStats(INITIAL_STATS);
    }
  }, []);

  const stop = useCallback(() => {
    trackerRef.current?.stop();
    trackerRef.current = null;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    setStats((prev) => (prev.status === "recording" ? { ...prev, status: "stopped" } : prev));
  }, []);

  const reset = useCallback(() => {
    trackerRef.current?.stop();
    trackerRef.current = null;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    readingsRef.current = [];
    lastTMsRef.current = null;
    setAudioBlob(null);
    setStats(INITIAL_STATS);
  }, []);

  // Never leave the mic open if the step unmounts mid-recording.
  useEffect(() => {
    return () => {
      trackerRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const getReadings = useCallback((): CentsSample[] => readingsRef.current.slice(), []);

  return { permission, stats, audioBlob, start, stop, reset, getReadings };
}
