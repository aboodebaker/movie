"use client";

import { useState } from "react";
import { SURAHS } from "@/data/surahs";
import { computeAnchors } from "@/lib/pitch/cents";
import { saveProfile, type VoiceProfile } from "@/lib/profile/store";
import CalibrationStep, { type StepCompletion } from "./CalibrationStep";
import ResultsCard from "./ResultsCard";
import styles from "./calibrate.module.css";

const FATIHAH = SURAHS.find((s) => s.number === 1)!;
const IKHLAS = SURAHS.find((s) => s.number === 112)!;
const IKHLAS_FIRST_TWO = IKHLAS.ayat.slice(0, 2);

// Minimum total voiced samples (across recitation steps) to trust the pooled
// anchors; matches the "≥100 voiced frames per step" guard applied per-step.
const MIN_POOLED_VOICED_FRAMES = 100;

// A dedicated "hold a steady note" window, in ms, used to estimate wobble
// from the sustain phase rather than the glide that follows it.
const SUSTAIN_WINDOW_MS = 5000;
const SUSTAIN_MIN_SAMPLES = 20;
const SUSTAIN_FALLBACK_SAMPLES = 150;

type Phase = "step1" | "step2" | "step3" | "results";

const STEP_NUMBER: Record<Phase, number> = { step1: 1, step2: 2, step3: 3, results: 4 };

function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

interface Step1Result {
  wobble: number;
  absoluteLow: number;
  absoluteHigh: number;
}

export default function CalibratePage() {
  const [phase, setPhase] = useState<Phase>("step1");
  const [step1, setStep1] = useState<Step1Result | null>(null);
  const [recitationCents, setRecitationCents] = useState<number[]>([]);
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleStep1Complete = (result: StepCompletion) => {
    const sustainWindow = result.voicedReadings.filter((v) => v.tMs <= SUSTAIN_WINDOW_MS);
    const sustainCents =
      sustainWindow.length >= SUSTAIN_MIN_SAMPLES
        ? sustainWindow.map((v) => v.cents)
        : result.voicedReadings.slice(0, SUSTAIN_FALLBACK_SAMPLES).map((v) => v.cents);

    setStep1({
      wobble: stdDev(sustainCents),
      absoluteLow: Math.min(...result.voicedCents),
      absoluteHigh: Math.max(...result.voicedCents),
    });
    setNotice(null);
    setPhase("step2");
  };

  const handleStep2Complete = (result: StepCompletion) => {
    setRecitationCents(result.voicedCents);
    setPhase("step3");
  };

  const handleStep3Complete = (result: StepCompletion) => {
    const pooled = [...recitationCents, ...result.voicedCents];

    if (!step1 || pooled.length < MIN_POOLED_VOICED_FRAMES) {
      setNotice(
        "That wasn't quite enough clean voice across the recitation steps to build a reliable profile. Let's redo Al-Fatihah and the two ayat — try to stay close to the mic in a quiet room.",
      );
      setRecitationCents([]);
      setPhase("step2");
      return;
    }

    const anchors = computeAnchors(pooled);
    const built: VoiceProfile = {
      anchors,
      absoluteLow: Math.min(step1.absoluteLow, anchors.low),
      absoluteHigh: Math.max(step1.absoluteHigh, anchors.high),
      wobble: step1.wobble,
      calibratedAt: new Date().toISOString(),
    };
    saveProfile(built);
    setProfile(built);
    setNotice(null);
    setPhase("results");
  };

  const handleStartOver = () => {
    setPhase("step1");
    setStep1(null);
    setRecitationCents([]);
    setProfile(null);
    setNotice(null);
  };

  return (
    <>
      <h1 style={{ margin: "0.5rem 0" }}>Voice calibration</h1>
      <p className="muted">
        About ninety seconds, three short steps. This measures your own
        comfortable range — there is no right sound, only yours. Guidance,
        never grading.
      </p>

      {phase !== "results" && (
        <div className={styles.stepIndicator} aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={
                n === STEP_NUMBER[phase]
                  ? styles.stepDotActive
                  : n < STEP_NUMBER[phase]
                    ? styles.stepDotDone
                    : styles.stepDot
              }
            >
              {n}
            </span>
          ))}
        </div>
      )}

      {notice && (
        <div className={styles.errorBox} role="status" aria-live="polite">
          <p>{notice}</p>
        </div>
      )}

      {phase === "step1" && (
        <CalibrationStep
          stepNumber={1}
          title="Sustain & glide"
          instructions="Hum or sustain a comfortable note for a few seconds — nothing effortful, just an easy, steady tone. Then glide gently up to a soft ceiling, and back down to a soft floor. This sets your outer limits."
          minVoicedMs={8000}
          onComplete={handleStep1Complete}
        />
      )}

      {phase === "step2" && (
        <CalibrationStep
          stepNumber={2}
          title="Recite Al-Fatihah"
          instructions="Recite naturally, at whatever pace and pitch feels normal to you — no need to perform."
          arabicLines={FATIHAH.ayat.map((a) => a.arabic)}
          minVoicedMs={15000}
          onComplete={handleStep2Complete}
        />
      )}

      {phase === "step3" && (
        <CalibrationStep
          stepNumber={3}
          title="Two short ayat"
          instructions="Recite these two ayat of Al-Ikhlas naturally."
          arabicLines={IKHLAS_FIRST_TWO.map((a) => a.arabic)}
          minVoicedMs={6000}
          nextLabel="Finish →"
          onComplete={handleStep3Complete}
        />
      )}

      {phase === "results" && profile && (
        <ResultsCard profile={profile} onStartOver={handleStartOver} />
      )}
    </>
  );
}
