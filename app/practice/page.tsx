"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RECITERS, SURAHS } from "@/data/surahs";
import type { Anchors } from "@/lib/pitch/cents";
import { loadProfile, profileIsStale, type VoiceProfile } from "@/lib/profile/store";
import { startMicPitch, type MicPitchTracker, type PitchReading } from "@/lib/audio/micPitch";
import { CUE_TEXT, type CueId } from "@/lib/cues/engine";
import { loadClip, type ClipData } from "./contourCache";
import PracticeLane, { type PlaybackStats } from "./PracticeLane";
import SoloPractice from "./SoloPractice";
import WordStrip from "./WordStrip";
import styles from "./practice.module.css";

type ClipStatus = "idle" | "loading" | "ready" | "error";
type PracticeMode = "shadow" | "solo";

// Treat "resumed at the very end" as a fresh start, not a start() past duration.
const END_EPSILON_SEC = 0.05;
// Require a little voiced signal before showing a take summary — a mostly
// silent take (mic denied, user didn't recite) shouldn't produce a number.
const MIN_SUMMARY_FRAMES = 30;

export default function PracticePage() {
  const [reciterId, setReciterId] = useState(RECITERS[0].id);
  const [surahNumber, setSurahNumber] = useState(SURAHS[0].number);
  const [ayahNumber, setAyahNumber] = useState(SURAHS[0].ayat[0].ayah);

  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [exploreMode, setExploreMode] = useState(false);
  const [mode, setMode] = useState<PracticeMode>("shadow");

  const [clipStatus, setClipStatus] = useState<ClipStatus>("idle");
  const [clipError, setClipError] = useState<string | null>(null);
  const [clipData, setClipData] = useState<ClipData | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [cueId, setCueId] = useState<CueId>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ within60: number; within150: number } | null>(null);
  const [resetSignal, setResetSignal] = useState(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtCtxTimeRef = useRef(0);
  const pausedOffsetRef = useRef(0);
  const isPlayingRef = useRef(false);
  const manualStopRef = useRef(false);
  const micTrackerRef = useRef<MicPitchTracker | null>(null);
  const micReadingRef = useRef<PitchReading | null>(null);
  const statsRef = useRef<PlaybackStats>({ frames: 0, within60: 0, within150: 0 });

  useEffect(() => {
    setProfile(loadProfile());
    setProfileLoaded(true);
  }, []);

  const currentSurah = useMemo(
    () => SURAHS.find((s) => s.number === surahNumber) ?? SURAHS[0],
    [surahNumber],
  );
  const currentAyahIndex = currentSurah.ayat.findIndex((a) => a.ayah === ayahNumber);
  const currentAyah = currentSurah.ayat[currentAyahIndex] ?? currentSurah.ayat[0];
  const currentReciter = RECITERS.find((r) => r.id === reciterId) ?? RECITERS[0];

  const ensureAudioCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current) {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.gain.value = volume;
      gain.connect(ctx.destination);
      audioCtxRef.current = ctx;
      gainNodeRef.current = gain;
    }
    return audioCtxRef.current;
    // Intentionally only created once; volume changes go through gain.value directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopMic = useCallback(() => {
    micTrackerRef.current?.stop();
    micTrackerRef.current = null;
    micReadingRef.current = null;
  }, []);

  const hardStop = useCallback(() => {
    manualStopRef.current = true;
    try {
      sourceRef.current?.stop();
    } catch {
      // already stopped
    }
    sourceRef.current = null;
    isPlayingRef.current = false;
    setIsPlaying(false);
    stopMic();
  }, [stopMic]);

  const getPlaybackTimeSec = useCallback((): number => {
    if (!isPlayingRef.current || !audioCtxRef.current) return pausedOffsetRef.current;
    return pausedOffsetRef.current + (audioCtxRef.current.currentTime - startedAtCtxTimeRef.current);
  }, []);

  const finalizeSummary = useCallback(() => {
    const s = statsRef.current;
    if (s.frames >= MIN_SUMMARY_FRAMES) {
      setSummary({
        within60: Math.round((s.within60 / s.frames) * 100),
        within150: Math.round((s.within150 / s.frames) * 100),
      });
    }
  }, []);

  // Load (or fetch from cache) the selected clip whenever the selection
  // changes, and stop any in-flight take.
  useEffect(() => {
    hardStop();
    setClipStatus("loading");
    setClipError(null);
    setClipData(null);
    setSummary(null);
    setCueId(null);
    setMicError(null);
    pausedOffsetRef.current = 0;
    setResetSignal((s) => s + 1);

    let cancelled = false;
    const ctx = ensureAudioCtx();
    loadClip(ctx, reciterId, surahNumber, ayahNumber)
      .then((data) => {
        if (cancelled) return;
        setClipData(data);
        setClipStatus("ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setClipStatus("error");
        setClipError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reciterId, surahNumber, ayahNumber]);

  // Clean up everything on unmount.
  useEffect(() => {
    return () => {
      try {
        sourceRef.current?.stop();
      } catch {
        // ignore
      }
      micTrackerRef.current?.stop();
      void audioCtxRef.current?.close();
    };
  }, []);

  const handlePlay = useCallback(async () => {
    if (!clipData) return;
    const ctx = ensureAudioCtx();
    await ctx.resume();

    if (pausedOffsetRef.current >= clipData.buffer.duration - END_EPSILON_SEC) {
      pausedOffsetRef.current = 0;
      setResetSignal((s) => s + 1);
    }
    // Clamp defensively: source.start() throws if the offset reaches the
    // buffer's duration (e.g. float drift from a pause right at the end).
    const startOffset = Math.min(
      Math.max(pausedOffsetRef.current, 0),
      Math.max(0, clipData.buffer.duration - 0.005),
    );
    pausedOffsetRef.current = startOffset;

    const source = ctx.createBufferSource();
    source.buffer = clipData.buffer;
    source.connect(gainNodeRef.current!);
    manualStopRef.current = false;
    source.onended = () => {
      if (manualStopRef.current) return; // manual pause/stop, not a natural end
      isPlayingRef.current = false;
      setIsPlaying(false);
      pausedOffsetRef.current = clipData.buffer.duration;
      stopMic();
      finalizeSummary();
    };
    source.start(0, startOffset);
    sourceRef.current = source;
    startedAtCtxTimeRef.current = ctx.currentTime;
    isPlayingRef.current = true;
    setIsPlaying(true);
    setSummary(null);

    if (!micTrackerRef.current) {
      try {
        const tracker = await startMicPitch((r) => {
          micReadingRef.current = r;
        });
        micTrackerRef.current = tracker;
        setMicError(null);
      } catch {
        setMicError(
          "Microphone unavailable — live cues need mic access. Audio and the target line will keep playing without them.",
        );
      }
    }
  }, [clipData, ensureAudioCtx, finalizeSummary, stopMic]);

  const handlePause = useCallback(() => {
    if (!isPlayingRef.current) return;
    manualStopRef.current = true;
    pausedOffsetRef.current = getPlaybackTimeSec();
    try {
      sourceRef.current?.stop();
    } catch {
      // ignore
    }
    sourceRef.current = null;
    isPlayingRef.current = false;
    setIsPlaying(false);
    stopMic();
  }, [getPlaybackTimeSec, stopMic]);

  const handleRestart = useCallback(() => {
    hardStop();
    pausedOffsetRef.current = 0;
    setSummary(null);
    setCueId(null);
    setResetSignal((s) => s + 1);
  }, [hardStop]);

  const handleModeChange = useCallback(
    (next: PracticeMode) => {
      setMode((prev) => {
        if (prev === next) return prev;
        // Leaving shadow mode: stop any in-flight reference playback + mic,
        // same as switching ayah. Shadow's own state stays untouched so
        // flipping back finds it exactly as it was.
        if (prev === "shadow") hardStop();
        return next;
      });
    },
    [hardStop],
  );

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setVolume(v);
    if (gainNodeRef.current) gainNodeRef.current.gain.value = v;
  }, []);

  const goPrevAyah = () => {
    if (currentAyahIndex > 0) setAyahNumber(currentSurah.ayat[currentAyahIndex - 1].ayah);
  };
  const goNextAyah = () => {
    if (currentAyahIndex < currentSurah.ayat.length - 1) {
      setAyahNumber(currentSurah.ayat[currentAyahIndex + 1].ayah);
    }
  };

  const effectiveAnchors: Anchors | null =
    profile?.anchors ?? (exploreMode ? clipData?.contour.anchors ?? null : null);
  const wobble = profile?.wobble ?? 0;
  const usingExploreAnchors = !profile && exploreMode;

  const cueClass =
    cueId === "good"
      ? styles.cueGood
      : cueId === "touch-low" || cueId === "touch-high"
        ? styles.cueTouch
        : cueId === "too-low" || cueId === "too-high"
          ? styles.cueOff
          : "";
  const cueLabel = cueId ? CUE_TEXT[cueId] : isPlaying ? "Listening…" : "Press play to begin";

  return (
    <>
      <h1 style={{ margin: "0.5rem 0" }}>Practice</h1>
      <p className="muted">
        {mode === "shadow"
          ? "Shadow the reciter: his contour, projected into your voice, scrolls toward the playhead. Follow the gold line — guidance, never grading."
          : "Solo mode: recite the ayah alone, no reference playing. Afterwards, review how your take lines up against the reciter's melody, word by word."}
      </p>

      <div className={styles.modeToggle} role="group" aria-label="Practice mode">
        <button
          type="button"
          className={mode === "shadow" ? styles.modeButtonActive : styles.modeButton}
          onClick={() => handleModeChange("shadow")}
        >
          Shadow
        </button>
        <button
          type="button"
          className={mode === "solo" ? styles.modeButtonActive : styles.modeButton}
          onClick={() => handleModeChange("solo")}
        >
          Solo
        </button>
      </div>

      <div className={`card ${styles.selectionBar}`}>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="reciter-select">
            Reciter
          </label>
          <select
            id="reciter-select"
            value={reciterId}
            onChange={(e) => setReciterId(e.target.value)}
          >
            {RECITERS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="surah-select">
            Surah
          </label>
          <select
            id="surah-select"
            value={surahNumber}
            onChange={(e) => {
              const num = Number(e.target.value);
              const s = SURAHS.find((s) => s.number === num) ?? SURAHS[0];
              setSurahNumber(s.number);
              setAyahNumber(s.ayat[0].ayah);
            }}
          >
            {SURAHS.map((s) => (
              <option key={s.number} value={s.number}>
                {s.number}. {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="ayah-select">
            Ayah
          </label>
          <select
            id="ayah-select"
            value={ayahNumber}
            onChange={(e) => setAyahNumber(Number(e.target.value))}
          >
            {currentSurah.ayat.map((a) => (
              <option key={a.ayah} value={a.ayah}>
                {a.ayah}
              </option>
            ))}
          </select>
        </div>
      </div>

      {profileLoaded && !profile && !exploreMode && (
        <div className="card">
          <p>
            <strong>No voice profile yet.</strong> Calibrate once so the lane
            is drawn in your own comfortable range — the reciter&apos;s high
            becomes your high, not his frequency.
          </p>
          <p style={{ marginTop: "0.75rem" }}>
            <Link href="/calibrate">
              <button className="primary">Calibrate my voice →</button>
            </Link>{" "}
            <button className="ghost" onClick={() => setExploreMode(true)}>
              Just explore (use the reciter&apos;s own range)
            </button>
          </p>
        </div>
      )}

      {(profile || exploreMode) && (
        <>
          <div className={`card ${styles.arabicCard} ${isPlaying ? styles.arabicCardActive : ""}`}>
            <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.4rem" }}>
              {currentReciter.name} · {currentSurah.name} {currentSurah.arabicName}
            </p>
            <WordStrip
              words={clipData?.words ?? null}
              fallbackArabic={currentAyah.arabic}
              getPlaybackTimeSec={getPlaybackTimeSec}
              isPlayingRef={isPlayingRef}
              resetSignal={resetSignal}
            />
            {usingExploreAnchors && (
              <p className="muted" style={{ fontSize: "0.8rem", marginTop: "0.5rem" }}>
                Exploring with {currentReciter.name}&apos;s own range (no voice profile
                calibrated) — projections are for feel only.
              </p>
            )}
            {profile && profileIsStale(profile) && (
              <p style={{ fontSize: "0.8rem", marginTop: "0.5rem", color: "var(--red)" }}>
                Your voice profile is over a month old —{" "}
                <Link href="/calibrate">re-calibrate</Link> for an accurate lane.
              </p>
            )}
            <div className={styles.navRow}>
              <button className="ghost" onClick={goPrevAyah} disabled={currentAyahIndex <= 0}>
                ← Prev ayah
              </button>
              <span className={styles.navLabel}>
                Ayah {currentAyah.ayah} of {currentSurah.ayat.length}
              </span>
              <button
                className="ghost"
                onClick={goNextAyah}
                disabled={currentAyahIndex >= currentSurah.ayat.length - 1}
              >
                Next ayah →
              </button>
            </div>
          </div>

          {clipStatus === "loading" && <p className={styles.loadingText}>Loading and analysing the reference audio…</p>}

          {clipStatus === "error" && (
            <div className={styles.errorBox}>
              <p>{clipError ?? "Something went wrong loading this ayah."}</p>
            </div>
          )}

          {clipStatus === "ready" && clipData && effectiveAnchors && mode === "shadow" && (
            <>
              <div className={styles.laneWrapper}>
                <PracticeLane
                  contour={clipData.contour}
                  userAnchors={effectiveAnchors}
                  wobble={wobble}
                  getPlaybackTimeSec={getPlaybackTimeSec}
                  isPlayingRef={isPlayingRef}
                  micReadingRef={micReadingRef}
                  statsRef={statsRef}
                  resetSignal={resetSignal}
                  onCueChange={setCueId}
                />
              </div>

              <div className={`${styles.cueBanner} ${cueClass}`}>{cueLabel}</div>

              <div className={styles.controls}>
                {isPlaying ? (
                  <button className="primary" onClick={handlePause}>
                    Pause
                  </button>
                ) : (
                  <button className="primary" onClick={() => void handlePlay()}>
                    Play
                  </button>
                )}
                <button className="ghost" onClick={handleRestart}>
                  Restart
                </button>
                <div className={styles.volumeRow}>
                  <span>Reciter volume</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={volume}
                    onChange={handleVolumeChange}
                  />
                  <span>{Math.round(volume * 100)}%</span>
                </div>
              </div>

              {micError && <p className={styles.micWarning}>{micError}</p>}

              {summary && (
                <div className="card">
                  <p>
                    <strong>That take:</strong> you rode the line{" "}
                    {summary.within150}% of the ayah, {summary.within60}% of it
                    right on the note. Guidance, never grading — just keep
                    shadowing.
                  </p>
                  <div className={styles.summaryGrid}>
                    <div className={styles.statTile}>
                      <div className={styles.statLabel}>Within 60 cents</div>
                      <div className={styles.statValue}>{summary.within60}%</div>
                    </div>
                    <div className={styles.statTile}>
                      <div className={styles.statLabel}>Within 150 cents</div>
                      <div className={styles.statValue}>{summary.within150}%</div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {clipStatus === "ready" && clipData && effectiveAnchors && mode === "solo" && (
            <SoloPractice
              key={`${reciterId}|${surahNumber}|${ayahNumber}`}
              clipData={clipData}
              userAnchors={effectiveAnchors}
              wobble={wobble}
              onShadowThisAyah={() => handleModeChange("shadow")}
            />
          )}
        </>
      )}
    </>
  );
}
