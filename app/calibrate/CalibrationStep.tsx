"use client";

import { useMicRecorder, type VoicedSample } from "./useMicRecorder";
import PitchMeter from "./PitchMeter";
import styles from "./calibrate.module.css";

export interface StepCompletion {
  voicedCents: number[];
  voicedReadings: VoicedSample[];
}

interface Props {
  stepNumber: 1 | 2 | 3;
  title: string;
  instructions: string;
  arabicLines?: string[];
  /** Minimum voiced (pitched) audio, in ms, required before "Next" enables. */
  minVoicedMs: number;
  /** Minimum voiced frames required — guards against a near-empty take. */
  minVoicedFrames?: number;
  nextLabel?: string;
  onComplete: (result: StepCompletion) => void;
}

export default function CalibrationStep({
  stepNumber,
  title,
  instructions,
  arabicLines,
  minVoicedMs,
  minVoicedFrames = 100,
  nextLabel = "Next →",
  onComplete,
}: Props) {
  const recorder = useMicRecorder();

  const meetsMinimum =
    recorder.stats.voicedMs >= minVoicedMs && recorder.stats.voicedFrameCount >= minVoicedFrames;

  const handleStart = () => {
    void recorder.start();
  };
  const handleStop = () => recorder.stop();
  const handleRedo = () => recorder.reset();
  const handleNext = () => {
    if (!meetsMinimum) return;
    onComplete({
      voicedCents: recorder.getVoicedCents(),
      voicedReadings: recorder.getVoicedReadings(),
    });
  };

  const secs = (ms: number) => (ms / 1000).toFixed(1);

  return (
    <div className="card">
      <p className="muted">Step {stepNumber} of 3</p>
      <h2 style={{ margin: "0.2rem 0 0.5rem" }}>{title}</h2>
      <p>{instructions}</p>

      {arabicLines && (
        <div className={styles.arabicBlock}>
          {arabicLines.map((line, i) => (
            <p className="arabic" key={i}>
              {line}
            </p>
          ))}
        </div>
      )}

      {recorder.permission === "denied" && (
        <div className={styles.errorBox} role="alert">
          <p>
            Microphone access was denied, so this step can&apos;t record. Check
            your browser&apos;s site settings to allow the microphone, then try
            again.
          </p>
          <button className="ghost" onClick={handleStart}>
            Retry
          </button>
        </div>
      )}

      {recorder.stats.status !== "idle" && (
        <PitchMeter reading={recorder.stats.current} />
      )}

      <p aria-live="polite" className={styles.liveStatus}>
        {recorder.permission === "requesting" && "Requesting microphone access…"}
        {recorder.stats.status === "idle" &&
          recorder.permission !== "requesting" &&
          recorder.permission !== "denied" &&
          "Not recording yet."}
        {recorder.stats.status === "recording" &&
          `Recording — ${secs(recorder.stats.elapsedMs)}s elapsed, ${secs(
            recorder.stats.voicedMs,
          )}s of voice captured.`}
        {recorder.stats.status === "stopped" &&
          (meetsMinimum
            ? `Captured ${secs(recorder.stats.voicedMs)}s of voice — that's enough. Move on, or redo if you want another try.`
            : `Only captured ${secs(recorder.stats.voicedMs)}s of clear voice; aiming for at least ${(
                minVoicedMs / 1000
              ).toFixed(0)}s. Please redo this step, a little closer to the mic if needed.`)}
      </p>

      <div className={styles.controls}>
        {recorder.stats.status === "idle" && recorder.permission !== "denied" && (
          <button className="primary" onClick={handleStart} disabled={recorder.permission === "requesting"}>
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
              Redo this step
            </button>
            <button className="primary" disabled={!meetsMinimum} onClick={handleNext}>
              {nextLabel}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
