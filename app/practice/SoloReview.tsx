"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Contour } from "@/lib/contour/extract";
import type { Anchors } from "@/lib/pitch/cents";
import type { WordTiming } from "@/lib/segments/types";
import { readColors, hexToRgb } from "./PracticeLane";
import type { SoloReviewResult, WordReview } from "./soloAlign";
import { wordPacePhrase, wordPitchPhrase } from "./soloAlign";
import styles from "./practice.module.css";

export interface SoloReviewProps {
  review: SoloReviewResult;
  refContour: Contour;
  /** Decoded reference audio, for the "reciter" word-popover button. */
  refBuffer: AudioBuffer;
  userAnchors: Anchors;
  /** Object URL of the recorded take, or null until MediaRecorder finishes flushing. */
  takeBlobUrl: string | null;
  onTryAgain: () => void;
  onShadowThisAyah: () => void;
}

const CHIP_COLOR_CLASS: Record<WordReview["color"], string> = {
  green: "chipGreen",
  amber: "chipAmber",
  red: "chipRed",
};

/**
 * Seek an <audio> element to [startSec, endSec) of a (possibly still-recording-
 * format) blob URL and play just that slice, then pause. Chrome's in-memory
 * webm blobs often report Infinity duration until you seek near the end once
 * — the standard workaround is forcing that seek before the real one.
 */
function playBlobSlice(
  audio: HTMLAudioElement,
  url: string,
  startSec: number,
  endSec: number,
): Promise<void> {
  return new Promise((resolve) => {
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("error", onError);
      resolve();
    };

    const onTimeUpdate = () => {
      if (audio.currentTime >= endSec || audio.ended) {
        audio.pause();
        finish();
      }
    };
    const seekAndPlay = () => {
      audio.currentTime = startSec;
      audio.addEventListener("timeupdate", onTimeUpdate);
      void audio.play().catch(() => finish());
    };
    const onDurationChange = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        audio.removeEventListener("durationchange", onDurationChange);
        seekAndPlay();
      }
    };
    const onLoaded = () => {
      if (!Number.isFinite(audio.duration)) {
        // Force duration computation on an in-memory webm blob.
        audio.addEventListener("durationchange", onDurationChange);
        audio.currentTime = 1e9;
      } else {
        seekAndPlay();
      }
    };
    const onError = () => finish();

    audio.pause();
    audio.addEventListener("loadedmetadata", onLoaded, { once: true });
    audio.addEventListener("error", onError, { once: true });
    if (audio.src !== url) {
      audio.src = url;
      audio.load();
    } else if (audio.readyState >= 1) {
      onLoaded();
    }
  });
}

export default function SoloReview({
  review,
  refContour,
  refBuffer,
  userAnchors,
  takeBlobUrl,
  onTryAgain,
  onShadowThisAyah,
}: SoloReviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const takeAudioRef = useRef<HTMLAudioElement | null>(null);
  const refAudioCtxRef = useRef<AudioContext | null>(null);
  const refSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const [openWordIndex, setOpenWordIndex] = useState<number | null>(null);

  // Draw the static overlay (whole ayah, no scrolling — unlike the live lane).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const colors = readColors();

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const duration = Math.max(0.5, refContour.durationSec);
      const timeToX = (t: number) => (t / duration) * w;
      const yLow = userAnchors.low - 300;
      const yHigh = userAnchors.high + 300;
      const span = Math.max(1, yHigh - yLow);
      const centsToY = (c: number) => h - ((c - yLow) / span) * h;

      ctx.font = "11px system-ui, sans-serif";
      ctx.textBaseline = "middle";
      const guides: [number, string][] = [
        [userAnchors.low, "low"],
        [userAnchors.mid, "mid"],
        [userAnchors.high, "high"],
      ];
      for (const [c, label] of guides) {
        const y = centsToY(c);
        ctx.strokeStyle = colors.border;
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.fillStyle = colors.textDim;
        ctx.fillText(label, 4, y - 6);
      }

      const times = refContour.times;
      ctx.lineCap = "round";

      const [gr, gg, gb] = hexToRgb(colors.gold);
      ctx.strokeStyle = `rgb(${gr}, ${gg}, ${gb})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      let goldOpen = false;
      for (let i = 0; i < times.length; i++) {
        const c = review.refProjected[i];
        if (c === null) {
          goldOpen = false;
          continue;
        }
        const prev = i > 0 ? review.refProjected[i - 1] : null;
        if (prev !== null && Math.abs(c - prev) > 300) goldOpen = false;
        const x = timeToX(times[i]);
        const y = centsToY(c);
        if (!goldOpen) {
          ctx.moveTo(x, y);
          goldOpen = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      const [grn, ggn, gbn] = hexToRgb(colors.green);
      ctx.strokeStyle = `rgb(${grn}, ${ggn}, ${gbn})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      let greenOpen = false;
      for (let i = 0; i < times.length; i++) {
        const c = review.greenLine[i];
        if (c === null) {
          greenOpen = false;
          continue;
        }
        const prev = i > 0 ? review.greenLine[i - 1] : null;
        if (prev !== null && Math.abs(c - prev) > 300) greenOpen = false;
        const x = timeToX(times[i]);
        const y = centsToY(c);
        if (!greenOpen) {
          ctx.moveTo(x, y);
          greenOpen = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [review, refContour, userAnchors]);

  // Clean up the reciter-slice AudioContext and any playing take audio on unmount.
  useEffect(() => {
    const audio = takeAudioRef.current;
    return () => {
      try {
        refSourceRef.current?.stop();
      } catch {
        // already stopped
      }
      void refAudioCtxRef.current?.close();
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
    };
  }, []);

  const playReciterWord = (word: WordTiming) => {
    if (!Number.isFinite(word.startSec) || !Number.isFinite(word.endSec) || word.endSec <= word.startSec) return;
    if (!refAudioCtxRef.current) refAudioCtxRef.current = new AudioContext();
    const ctx = refAudioCtxRef.current;
    void ctx.resume();
    try {
      refSourceRef.current?.stop();
    } catch {
      // already stopped
    }
    const src = ctx.createBufferSource();
    src.buffer = refBuffer;
    src.connect(ctx.destination);
    const start = Math.max(0, word.startSec);
    const dur = Math.max(0.05, word.endSec - word.startSec);
    src.start(0, start, dur);
    refSourceRef.current = src;
  };

  const playYouWord = (wr: WordReview) => {
    if (!takeBlobUrl || !takeAudioRef.current) return;
    void playBlobSlice(takeAudioRef.current, takeBlobUrl, wr.userStartSec, wr.userEndSec);
  };

  const headline = useMemo(() => {
    const r = review;
    return `You rode the line ${r.within150Pct}% of the ayah, ${r.within60Pct}% of it right on the note — ${r.closenessPhrase}. Guidance, never grading.`;
  }, [review]);

  return (
    <div className={styles.reviewCard}>
      <div className={styles.laneWrapper}>
        <canvas ref={canvasRef} className={styles.canvas} style={{ height: 220 }} />
      </div>
      <div className={styles.legendRow}>
        <span className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.legendDotGold}`} /> reciter (in your range)
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.legendDotGreen}`} /> you
        </span>
      </div>

      <p style={{ marginTop: "0.75rem" }}>{headline}</p>

      <div className={styles.summaryGrid}>
        <div className={styles.statTile}>
          <div className={styles.statLabel}>Within 60 cents</div>
          <div className={styles.statValue}>{review.within60Pct}%</div>
        </div>
        <div className={styles.statTile}>
          <div className={styles.statLabel}>Within 150 cents</div>
          <div className={styles.statValue}>{review.within150Pct}%</div>
        </div>
        <div className={styles.statTile}>
          <div className={styles.statLabel}>Direction agreement</div>
          <div className={styles.statValue}>{review.directionAgreementPct}%</div>
        </div>
        <div className={styles.statTile}>
          <div className={styles.statLabel}>Melody closeness</div>
          <div className={styles.statValueSmall}>{review.closenessPhrase}</div>
        </div>
      </div>

      {review.words && (
        <>
          <p className="muted" style={{ marginTop: "1rem", fontSize: "0.85rem" }}>
            Tap a word to hear both versions.
          </p>
          <div className={styles.chipRow}>
            {review.words.map((wr, i) => (
              <div key={wr.word.index} className={styles.chipWrap}>
                <button
                  type="button"
                  className={`${styles.chip} ${styles[CHIP_COLOR_CLASS[wr.color]]}`}
                  onClick={() => setOpenWordIndex(openWordIndex === i ? null : i)}
                >
                  {wr.word.textUthmani}
                </button>
                {openWordIndex === i && (
                  <div className={styles.popover}>
                    <p className={styles.popoverText}>
                      {wordPitchPhrase(wr.meanAbsErrorCents, wr.meanSignedErrorCents)} ·{" "}
                      {wordPacePhrase(wr.durationRatio)}
                    </p>
                    <div className={styles.popoverButtons}>
                      <button type="button" className="ghost" onClick={() => playReciterWord(wr.word)}>
                        ▶ reciter
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => playYouWord(wr)}
                        disabled={!takeBlobUrl}
                      >
                        ▶ you
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <audio ref={takeAudioRef} style={{ display: "none" }} preload="metadata" />

      <div className={styles.controls}>
        <button className="primary" onClick={onTryAgain}>
          Try again
        </button>
        <button className="ghost" onClick={onShadowThisAyah}>
          Shadow this ayah
        </button>
      </div>
    </div>
  );
}
