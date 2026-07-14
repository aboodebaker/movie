"use client";

import { useEffect, useRef, useState } from "react";
import type { WordTiming } from "@/lib/segments/types";
import styles from "./practice.module.css";

export interface WordStripProps {
  /** Word timing for the current clip, or null to render the plain whole-ayah text (no regression). */
  words: WordTiming[] | null;
  /** Whole-ayah Uthmani text, used verbatim when words is null. */
  fallbackArabic: string;
  /** Stable (identity-safe) accessor for current playback position, seconds — same clock as PracticeLane. */
  getPlaybackTimeSec: () => number;
  isPlayingRef: React.RefObject<boolean>;
  /** Bumped by the parent on ayah change / restart to reset the highlighted word. */
  resetSignal: number;
}

/** Index of the word active at tSec, or -1 before the first word starts. */
function findActiveIndex(words: WordTiming[], tSec: number): number {
  if (words.length === 0 || tSec < words[0].startSec) return -1;
  for (let i = 0; i < words.length; i++) {
    const nextStart = i + 1 < words.length ? words[i + 1].startSec : Infinity;
    if (tSec < nextStart) return i;
  }
  return words.length - 1;
}

/**
 * Ayah word strip: replaces the plain whole-ayah paragraph with individually
 * highlightable words when timing is available. Runs its own rAF loop
 * reading the shared playback clock (same pattern as PracticeLane) so React
 * state only updates when the active word index actually changes.
 */
export default function WordStrip({
  words,
  fallbackArabic,
  getPlaybackTimeSec,
  isPlayingRef,
  resetSignal,
}: WordStripProps) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const activeIndexRef = useRef(-1);

  useEffect(() => {
    activeIndexRef.current = -1;
    setActiveIndex(-1);
  }, [resetSignal, words]);

  useEffect(() => {
    if (!words || words.length === 0) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!isPlayingRef.current) return;
      const idx = findActiveIndex(words, getPlaybackTimeSec());
      if (idx !== activeIndexRef.current) {
        activeIndexRef.current = idx;
        setActiveIndex(idx);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [words, getPlaybackTimeSec, isPlayingRef]);

  if (!words || words.length === 0) {
    return <p className="arabic">{fallbackArabic}</p>;
  }

  return (
    <p className={`arabic ${styles.wordStrip}`} dir="rtl">
      {words.map((w, i) => (
        <span
          key={w.index}
          className={i === activeIndex ? `${styles.word} ${styles.wordActive}` : styles.word}
        >
          {w.textUthmani}
        </span>
      ))}
    </p>
  );
}
