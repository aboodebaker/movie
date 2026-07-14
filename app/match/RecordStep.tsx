"use client";

import { useVoiceRecording, type CentsSample } from "./useVoiceRecording";
import styles from "./match.module.css";

interface Props {
  onComplete: (readings: CentsSample[], audioBlob: Blob | null) => void;
}

// "≥ 30s" per the spec — long enough to see real movement/pause patterns,
// short enough not to feel like another calibration session.
const MIN_RECORD_MS = 30000;

export default function RecordStep({ onComplete }: Props) {
  const recorder = useVoiceRecording();
  const meetsMinimum = recorder.stats.elapsedMs >= MIN_RECORD_MS;

  const handleStart = () => void recorder.start();
  const handleStop = () => recorder.stop();
  const handleRedo = () => recorder.reset();
  const handleContinue = () => {
    if (!meetsMinimum) return;
    onComplete(recorder.getReadings(), recorder.audioBlob);
  };

  const secs = (ms: number) => (ms / 1000).toFixed(0);
  const level = recorder.stats.current?.level ?? 0;
  // Same scaling as the calibration PitchMeter: raw RMS is ~0.005-0.3 in
  // normal speech, so scale up for a readable meter.
  const levelPct = Math.min(100, Math.max(0, level * 500));

  return (
    <div className="card">
      <h2 style={{ margin: "0.2rem 0 0.5rem" }}>Record yourself</h2>
      <p className="muted">
        Recite anything you like — a favourite ayah, a surah you know well —
        for at least 30 seconds. This is just to hear how your own voice
        moves; no need to perform.
      </p>

      {recorder.permission === "denied" && (
        <div className={styles.errorBox} role="alert">
          <p>
            Microphone access was denied, so this can&apos;t record. Check
            your browser&apos;s site settings to allow the microphone, then
            try again.
          </p>
          <button className="ghost" onClick={handleStart}>
            Retry
          </button>
        </div>
      )}

      {recorder.stats.status !== "idle" && (
        <div className={styles.levelRow}>
          <span className={styles.levelLabel}>mic level</span>
          <div className={styles.levelTrack}>
            <div className={styles.levelFill} style={{ width: `${levelPct}%` }} />
          </div>
        </div>
      )}

      <p aria-live="polite" className={styles.liveStatus}>
        {recorder.permission === "requesting" && "Requesting microphone access…"}
        {recorder.stats.status === "idle" &&
          recorder.permission !== "requesting" &&
          recorder.permission !== "denied" &&
          "Not recording yet."}
        {recorder.stats.status === "recording" &&
          `Recording — ${secs(recorder.stats.elapsedMs)}s elapsed (aiming for 30s), ${secs(
            recorder.stats.voicedMs,
          )}s of voice captured.`}
        {recorder.stats.status === "stopped" &&
          (meetsMinimum
            ? `Captured ${secs(recorder.stats.elapsedMs)}s — that's enough. Continue, or redo for another try.`
            : `Only ${secs(recorder.stats.elapsedMs)}s captured; aiming for at least 30s. Please redo.`)}
      </p>

      <div className={styles.controls}>
        {recorder.stats.status === "idle" && recorder.permission !== "denied" && (
          <button
            className="primary"
            onClick={handleStart}
            disabled={recorder.permission === "requesting"}
          >
            ● Start recording
          </button>
        )}
        {recorder.stats.status === "recording" && (
          <button className="primary" onClick={handleStop}>
            ■ Stop
          </button>
        )}
        {recorder.stats.status === "stopped" && (
          <>
            <button className="ghost" onClick={handleRedo}>
              Redo
            </button>
            <button className="primary" disabled={!meetsMinimum} onClick={handleContinue}>
              See my matches →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
