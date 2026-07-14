"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Anchors } from "@/lib/pitch/cents";
import { startMicPitch, type MicPitchTracker, type PitchReading } from "@/lib/audio/micPitch";
import type { ClipData } from "./contourCache";
import PracticeLane, { type PlaybackStats } from "./PracticeLane";
import MicLiveCheck from "./MicLiveCheck";
import SoloReview from "./SoloReview";
import { buildSoloReview, type PitchSample, type SoloReviewOutcome } from "./soloAlign";
import styles from "./practice.module.css";

type Phase = "idle" | "countdown" | "recording" | "review";

export interface SoloPracticeProps {
  clipData: ClipData;
  userAnchors: Anchors;
  wobble: number;
  onShadowThisAyah: () => void;
}

const COUNT_IN_STEPS = [3, 2, 1];
const COUNT_IN_STEP_MS = 500;
const MIN_SAFETY_MS = 4000;

/**
 * Solo mode (spec §5.4): count-in, record with no reference playback, then
 * hand off to SoloReview once the take is stopped. Owns the mic/MediaRecorder
 * lifecycle end-to-end so a parent `key` change (ayah/reciter switch) is
 * enough to guarantee cleanup via unmount.
 */
export default function SoloPractice({ clipData, userAnchors, wobble, onShadowThisAyah }: SoloPracticeProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [reviewOutcome, setReviewOutcome] = useState<SoloReviewOutcome | null>(null);
  const [takeBlobUrl, setTakeBlobUrl] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);

  const isRecordingRef = useRef(false);
  const micReadingRef = useRef<PitchReading | null>(null);
  const micTrackerRef = useRef<MicPitchTracker | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const pitchTimelineRef = useRef<PitchSample[]>([]);
  const recordingStartRef = useRef(0);
  const statsRef = useRef<PlaybackStats>({ frames: 0, within60: 0, within150: 0 });
  const autoStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const takeBlobUrlRef = useRef<string | null>(null);

  const getElapsedSec = useCallback(() => (performance.now() - recordingStartRef.current) / 1000, []);

  const revokeBlobUrl = useCallback(() => {
    if (takeBlobUrlRef.current) {
      URL.revokeObjectURL(takeBlobUrlRef.current);
      takeBlobUrlRef.current = null;
    }
    setTakeBlobUrl(null);
  }, []);

  const cleanupMedia = useCallback(() => {
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    micTrackerRef.current?.stop();
    micTrackerRef.current = null;
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    } catch {
      // already stopped
    }
    mediaRecorderRef.current = null;
    recordStreamRef.current?.getTracks().forEach((t) => t.stop());
    recordStreamRef.current = null;
    isRecordingRef.current = false;
  }, []);

  // Full cleanup on unmount (ayah/reciter change via `key`, or mode switch away from solo).
  useEffect(() => {
    return () => {
      cleanupMedia();
      revokeBlobUrl();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopTake = useCallback(() => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    if (autoStopTimerRef.current) {
      clearTimeout(autoStopTimerRef.current);
      autoStopTimerRef.current = null;
    }
    // Stop the recorder before the tracker: they share one stream, and the
    // tracker's stop() ends the tracks — the recorder must flush first.
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    } catch {
      // already stopped
    }
    micTrackerRef.current?.stop();
    micTrackerRef.current = null;
    recordStreamRef.current?.getTracks().forEach((t) => t.stop());
    recordStreamRef.current = null;

    const outcome = buildSoloReview(pitchTimelineRef.current, clipData.contour, userAnchors, clipData.words);
    setReviewOutcome(outcome);
    setPhase("review");
  }, [clipData, userAnchors]);

  const beginRecording = useCallback(async () => {
    try {
      // One mic stream for both pitch tracking and the MediaRecorder — a
      // second getUserMedia grab silences the first stream on many phones,
      // which made every take come back "unvoiced".
      recordingStartRef.current = performance.now();
      const tracker = await startMicPitch((r) => {
        micReadingRef.current = r;
        pitchTimelineRef.current.push({ tMs: performance.now() - recordingStartRef.current, cents: r.cents });
      });
      micTrackerRef.current = tracker;
      recordStreamRef.current = tracker.stream;

      const mimeCandidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mimeType =
        typeof MediaRecorder !== "undefined"
          ? mimeCandidates.find((m) => MediaRecorder.isTypeSupported?.(m))
          : undefined;
      const mr = new MediaRecorder(tracker.stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        const url = URL.createObjectURL(blob);
        takeBlobUrlRef.current = url;
        setTakeBlobUrl(url);
      };
      mr.start();

      isRecordingRef.current = true;
      setPhase("recording");

      const safetyMs = Math.max(MIN_SAFETY_MS, clipData.contour.durationSec * 2 * 1000);
      autoStopTimerRef.current = setTimeout(() => stopTake(), safetyMs);
    } catch {
      setMicError("Microphone unavailable — solo recording needs mic access.");
      setPhase("idle");
    }
  }, [clipData, stopTake]);

  const startTake = useCallback(() => {
    cleanupMedia();
    revokeBlobUrl();
    setMicError(null);
    setReviewOutcome(null);
    chunksRef.current = [];
    pitchTimelineRef.current = [];
    micReadingRef.current = null;
    statsRef.current = { frames: 0, within60: 0, within150: 0 };
    setResetSignal((s) => s + 1);
    setPhase("countdown");

    let step = 0;
    setCountdownValue(COUNT_IN_STEPS[0]);
    const tick = () => {
      step++;
      if (step < COUNT_IN_STEPS.length) {
        setCountdownValue(COUNT_IN_STEPS[step]);
        countdownTimerRef.current = setTimeout(tick, COUNT_IN_STEP_MS);
      } else {
        setCountdownValue(null);
        void beginRecording();
      }
    };
    countdownTimerRef.current = setTimeout(tick, COUNT_IN_STEP_MS);
  }, [cleanupMedia, revokeBlobUrl, beginRecording]);

  return (
    <div className={styles.soloPanel}>
      {phase === "idle" && (
        <div className={styles.controls}>
          <button className="primary" onClick={startTake}>
            Record my take
          </button>
          <span className="muted">
            No reference audio plays back — recite the ayah alone, then review how it lined up.
          </span>
        </div>
      )}

      {phase === "countdown" && (
        <div className={styles.countdownOverlay}>
          <div className={styles.countdownNumber}>{countdownValue}</div>
          <p className="muted">Get ready…</p>
        </div>
      )}

      {phase === "recording" && (
        <>
          <div className={styles.laneWrapper}>
            <PracticeLane
              mode="solo"
              contour={clipData.contour}
              userAnchors={userAnchors}
              wobble={wobble}
              getPlaybackTimeSec={getElapsedSec}
              isPlayingRef={isRecordingRef}
              micReadingRef={micReadingRef}
              statsRef={statsRef}
              resetSignal={resetSignal}
              onCueChange={() => {}}
            />
          </div>
          <div className={styles.controls}>
            <button className="primary" onClick={stopTake}>
              Stop
            </button>
            <MicLiveCheck micReadingRef={micReadingRef} />
          </div>
        </>
      )}

      {phase === "review" && reviewOutcome?.ok && (
        <SoloReview
          review={reviewOutcome.review}
          refContour={clipData.contour}
          refBuffer={clipData.buffer}
          userAnchors={userAnchors}
          takeBlobUrl={takeBlobUrl}
          onTryAgain={startTake}
          onShadowThisAyah={onShadowThisAyah}
        />
      )}

      {phase === "review" && reviewOutcome && !reviewOutcome.ok && (
        <div className={styles.errorBox}>
          <p>{reviewOutcome.message}</p>
          <button className="ghost" onClick={startTake} style={{ marginTop: "0.6rem" }}>
            Try again
          </button>
        </div>
      )}

      {micError && <p className={styles.micWarning}>{micError}</p>}
    </div>
  );
}
