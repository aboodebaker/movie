"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RECITERS } from "@/data/surahs";
import { loadProfile, profileIsStale, type VoiceProfile } from "@/lib/profile/store";
import RecordStep from "./RecordStep";
import AnalysisProgress from "./AnalysisProgress";
import ReciterCard from "./ReciterCard";
import {
  computeReciterFeatures,
  type AnalysisProgress as Progress,
  type ReciterFeatures,
} from "./reciterFeatures";
import { StyleAccumulator, resampleReadings, type StyleVector } from "./styleVector";
import { rankReciters, type RankedReciter } from "./scoring";
import type { CentsSample } from "./useVoiceRecording";
import styles from "./match.module.css";

/** Read by /practice to preselect the matched reciter. */
const MATCHED_RECITER_KEY = "recitation-coach:matched-reciter";

type Phase = "loading" | "no-profile" | "record" | "analysing" | "results";

export default function MatchPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [profile, setProfile] = useState<VoiceProfile | null>(null);

  const [readings, setReadings] = useState<CentsSample[]>([]);
  const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null);

  const [progress, setProgress] = useState<Progress | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [reciterFeatures, setReciterFeatures] = useState<Record<string, ReciterFeatures> | null>(
    null,
  );

  const [blend, setBlend] = useState(0.5);

  useEffect(() => {
    const p = loadProfile();
    setProfile(p);
    setPhase(p ? "record" : "no-profile");
  }, []);

  // Revoke the object URL for the user's own take when it's replaced/unmounted.
  useEffect(() => {
    return () => {
      if (userAudioUrl) URL.revokeObjectURL(userAudioUrl);
    };
  }, [userAudioUrl]);

  const handleRecordingComplete = useCallback((r: CentsSample[], blob: Blob | null) => {
    setReadings(r);
    setUserAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return blob ? URL.createObjectURL(blob) : null;
    });
    setPhase("analysing");
    setAnalysisError(null);
    setProgress(null);

    computeReciterFeatures((p) => setProgress(p))
      .then((set) => {
        setReciterFeatures(set.reciters);
        setPhase("results");
      })
      .catch((e: unknown) => {
        setAnalysisError(
          e instanceof Error ? e.message : "Something went wrong analysing the reciters.",
        );
      });
  }, []);

  const userStyle: StyleVector | null = useMemo(() => {
    if (readings.length === 0) return null;
    const acc = new StyleAccumulator();
    const timesSec = readings.map((r) => r.tMs / 1000);
    const cents = readings.map((r) => r.cents);
    acc.addSeries(timesSec, cents);
    acc.addResampledDeltas(resampleReadings(cents));
    return acc.finalize();
  }, [readings]);

  const ranked: RankedReciter[] | null = useMemo(() => {
    if (!reciterFeatures || !profile || !userStyle) return null;
    const featureList = RECITERS.map((r) => reciterFeatures[r.id]).filter(
      (f): f is ReciterFeatures => Boolean(f),
    );
    if (featureList.length === 0) return null;
    return rankReciters(featureList, profile, userStyle, blend);
  }, [reciterFeatures, profile, userStyle, blend]);

  const handlePractice = useCallback(
    (reciterId: string) => {
      try {
        window.localStorage.setItem(MATCHED_RECITER_KEY, reciterId);
      } catch {
        // best-effort — practice page still works without it
      }
      router.push("/practice");
    },
    [router],
  );

  // Passing reciters get a real rank (#1, #2, …); failing ones show "—".
  const rankedWithRank = useMemo(() => {
    if (!ranked) return [];
    let passCount = 0;
    return ranked.map((r) => {
      if (r.rangeFit.passes) {
        passCount += 1;
        return { result: r, rank: passCount };
      }
      return { result: r, rank: null as number | null };
    });
  }, [ranked]);

  return (
    <>
      <h1 style={{ margin: "0.5rem 0" }}>Find my reciter</h1>
      <p className="muted">
        Rank the four reciters by how well they fit your voice — range
        comfort and melodic style, computed here on this device. Guidance,
        never grading.
      </p>

      {phase === "no-profile" && (
        <div className="card">
          <p>
            <strong>No voice profile yet.</strong> The match engine needs
            your calibrated range to check who fits comfortably before it
            looks at style at all.
          </p>
          <p style={{ marginTop: "0.75rem" }}>
            <Link href="/calibrate">
              <button className="primary">Calibrate my voice →</button>
            </Link>
          </p>
        </div>
      )}

      {phase === "record" && profile && (
        <>
          {profileIsStale(profile) && (
            <p style={{ color: "var(--red)", marginBottom: "0.75rem" }}>
              Your voice profile is over a month old —{" "}
              <Link href="/calibrate">re-calibrate</Link> for a more accurate
              match.
            </p>
          )}
          <RecordStep onComplete={handleRecordingComplete} />
        </>
      )}

      {phase === "analysing" && (
        <>
          <AnalysisProgress progress={progress} />
          {analysisError && (
            <div className={styles.errorBox}>
              <p>{analysisError}</p>
              <button className="ghost" onClick={() => setPhase("record")}>
                Back
              </button>
            </div>
          )}
        </>
      )}

      {phase === "results" && profile && userStyle && ranked && (
        <>
          <div className="card">
            <label className={styles.blendLabel} htmlFor="blend-slider">
              match my range comfort ⟷ match my style
            </label>
            <input
              id="blend-slider"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={blend}
              onChange={(e) => setBlend(Number(e.target.value))}
            />
            <p className="muted" style={{ fontSize: "0.85rem", marginTop: "0.3rem" }}>
              {Math.round(blend * 100)}% range comfort · {Math.round((1 - blend) * 100)}% style
            </p>
          </div>

          <div className="card muted" style={{ fontSize: "0.85rem" }}>
            <p>
              <strong style={{ color: "var(--text)" }}>Honest scope:</strong>{" "}
              range fit and melodic style are computed here, on-device, from
              Al-Fatihah. Timbre — whether a reciter&apos;s voice actually{" "}
              <em>sounds</em> like yours — needs a server-side
              speaker-embedding model, so that bar stays greyed out until the
              Phase 2 backend lands. It is not faked.
            </p>
          </div>

          {rankedWithRank.map(({ result, rank }) => {
            const reciter = RECITERS.find((rc) => rc.id === result.reciterId);
            const features = reciterFeatures?.[result.reciterId];
            if (!reciter || !features) return null;
            return (
              <ReciterCard
                key={result.reciterId}
                rank={rank}
                reciterName={reciter.name}
                reciterId={reciter.id}
                result={result}
                reciterStyle={features.style}
                userStyle={userStyle}
                userAudioUrl={userAudioUrl}
                onPractice={handlePractice}
              />
            );
          })}
        </>
      )}
    </>
  );
}
