"use client";

import { useEffect, useRef } from "react";
import { contourAt, type Contour } from "@/lib/contour/extract";
import { mapReciterToUser, type Anchors } from "@/lib/pitch/cents";
import type { PitchReading } from "@/lib/audio/micPitch";
import { CueEngine, type CueId } from "@/lib/cues/engine";
import styles from "./practice.module.css";

// Playhead sits ~30% across; ~1.8s of history, ~4.2s of lookahead (spec: "~2s
// behind and ~4s ahead").
const PLAYHEAD_FRAC = 0.3;
const WINDOW_SEC = 6;
const BEHIND_SEC = WINDOW_SEC * PLAYHEAD_FRAC;
const AHEAD_SEC = WINDOW_SEC * (1 - PLAYHEAD_FRAC);
const CANVAS_HEIGHT = 260;
const TRAIL_MAX_AGE = BEHIND_SEC + 0.2;

interface TrailPoint {
  t: number;
  cents: number;
}

export interface Colors {
  gold: string;
  green: string;
  red: string;
  accent: string;
  textDim: string;
  border: string;
}

export function readColors(): Colors {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    gold: v("--gold", "#d9a441"),
    green: v("--green", "#4fc38a"),
    red: v("--red", "#e06c5f"),
    accent: v("--accent", "#5b8def"),
    textDim: v("--text-dim", "#97a3b4"),
    border: v("--border", "#2a3240"),
  };
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function errorColor(errorCents: number | null, colors: Colors): string {
  if (errorCents === null) return colors.accent;
  const abs = Math.abs(errorCents);
  if (abs <= 60) return colors.green;
  if (abs <= 150) return colors.gold;
  return colors.red;
}

export interface PlaybackStats {
  frames: number;
  within60: number;
  within150: number;
}

export interface PracticeLaneProps {
  contour: Contour;
  userAnchors: Anchors;
  wobble: number;
  /** Stable (identity-safe) accessor for current playback position, seconds. */
  getPlaybackTimeSec: () => number;
  isPlayingRef: React.RefObject<boolean>;
  micReadingRef: React.RefObject<PitchReading | null>;
  statsRef: React.RefObject<PlaybackStats>;
  /** Bumped by the parent on ayah change / restart to reset cue + trail state. */
  resetSignal: number;
  onCueChange: (cue: CueId) => void;
  /**
   * "shadow" (default, unchanged behaviour): target line drawn from `contour`,
   * cue engine active, stats accumulated into `statsRef`.
   * "solo": no reference is playing, so there is no target — only the user's
   * own live trace scrolls on `getPlaybackTimeSec`'s clock. `contour`,
   * `statsRef` and `onCueChange` are still required props but are ignored.
   */
  mode?: "shadow" | "solo";
}

/**
 * The core horizontally-scrolling pitch lane. Runs its own requestAnimationFrame
 * loop reading mutable refs (mic reading, playback clock) so React state only
 * changes for the cue text, kept out of the hot path.
 */
export default function PracticeLane({
  contour,
  userAnchors,
  wobble,
  getPlaybackTimeSec,
  isPlayingRef,
  micReadingRef,
  statsRef,
  resetSignal,
  onCueChange,
  mode = "shadow",
}: PracticeLaneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorsRef = useRef<Colors | null>(null);
  const cueEngineRef = useRef(new CueEngine(wobble));
  const trailRef = useRef<TrailPoint[]>([]);
  const lastCueRef = useRef<CueId>(null);
  const onCueChangeRef = useRef(onCueChange);

  useEffect(() => {
    onCueChangeRef.current = onCueChange;
  }, [onCueChange]);

  useEffect(() => {
    colorsRef.current = readColors();
  }, []);

  // Reset cue engine + trail on ayah change / restart, or when calibrated
  // wobble changes (new profile).
  useEffect(() => {
    cueEngineRef.current = new CueEngine(wobble);
    trailRef.current = [];
    lastCueRef.current = null;
    onCueChangeRef.current(null);
    if (statsRef.current) {
      statsRef.current.frames = 0;
      statsRef.current.within60 = 0;
      statsRef.current.within150 = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal, wobble]);

  useEffect(() => {
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const colors = colorsRef.current;
      if (!canvas || !colors) return;

      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return;
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx2d.clearRect(0, 0, w, h);

      const tSec = getPlaybackTimeSec();
      const playheadX = w * PLAYHEAD_FRAC;
      const pxPerSec = w / WINDOW_SEC;
      const timeToX = (t: number) => playheadX + (t - tSec) * pxPerSec;

      const yLow = userAnchors.low - 300;
      const yHigh = userAnchors.high + 300;
      const span = Math.max(1, yHigh - yLow);
      const centsToY = (c: number) => h - ((c - yLow) / span) * h;

      // --- guide lines (user's low/mid/high) ---
      ctx2d.font = "11px system-ui, sans-serif";
      ctx2d.textBaseline = "middle";
      const guides: [number, string][] = [
        [userAnchors.low, "low"],
        [userAnchors.mid, "mid"],
        [userAnchors.high, "high"],
      ];
      for (const [c, label] of guides) {
        const y = centsToY(c);
        ctx2d.strokeStyle = colors.border;
        ctx2d.globalAlpha = 0.7;
        ctx2d.lineWidth = 1;
        ctx2d.setLineDash([4, 4]);
        ctx2d.beginPath();
        ctx2d.moveTo(0, y);
        ctx2d.lineTo(w, y);
        ctx2d.stroke();
        ctx2d.setLineDash([]);
        ctx2d.globalAlpha = 1;
        ctx2d.fillStyle = colors.textDim;
        ctx2d.fillText(label, 4, y - 6);
      }

      // --- playhead ---
      ctx2d.strokeStyle = colors.textDim;
      ctx2d.globalAlpha = 0.5;
      ctx2d.lineWidth = 1;
      ctx2d.beginPath();
      ctx2d.moveTo(playheadX, 0);
      ctx2d.lineTo(playheadX, h);
      ctx2d.stroke();
      ctx2d.globalAlpha = 1;

      // --- target line (reciter's contour projected into the user's range) ---
      // Shadow-only: solo mode has no reference playing, so there is nothing
      // to draw a target line against.
      const { times, cents, anchors: reciterAnchors } = contour;
      if (mode === "shadow") {
        const [gr, gg, gb] = hexToRgb(colors.gold);
        ctx2d.lineCap = "round";
        for (let i = 0; i < times.length - 1; i++) {
          const t1 = times[i];
          const t2 = times[i + 1];
          if (t2 < tSec - BEHIND_SEC || t1 > tSec + AHEAD_SEC) continue;
          const c1 = cents[i];
          const c2 = cents[i + 1];
          if (c1 === null || c2 === null) continue;
          // Don't connect across implausible frame-to-frame leaps (octave-error
          // blips in extraction) — a real voice can't move >300 cents in ~12 ms.
          if (Math.abs(c2 - c1) > 300) continue;
          const ahead = (t1 + t2) / 2 >= tSec;
          ctx2d.strokeStyle = `rgba(${gr}, ${gg}, ${gb}, ${ahead ? 0.95 : 0.35})`;
          ctx2d.lineWidth = ahead ? 3 : 1.5;
          ctx2d.beginPath();
          ctx2d.moveTo(timeToX(t1), centsToY(mapReciterToUser(c1, reciterAnchors, userAnchors)));
          ctx2d.lineTo(timeToX(t2), centsToY(mapReciterToUser(c2, reciterAnchors, userAnchors)));
          ctx2d.stroke();
        }
      }

      // --- target at playhead, for cue + dot coloring (shadow only) ---
      const rawTarget = mode === "shadow" ? contourAt(contour, tSec) : null;
      const targetC = rawTarget !== null ? mapReciterToUser(rawTarget, reciterAnchors, userAnchors) : null;

      const playing = isPlayingRef.current;
      const reading = playing ? micReadingRef.current : null;
      const userC = reading?.cents ?? null;
      const errorCents = mode === "shadow" && userC !== null && targetC !== null ? userC - targetC : null;

      if (playing) {
        if (userC !== null) {
          trailRef.current.push({ t: tSec, cents: userC });
        }
        if (mode === "shadow") {
          // Lookahead slope over a ~0.5s span, ~0.25-0.75s ahead.
          const t1 = tSec + 0.25;
          const t2 = tSec + 0.75;
          const rc1 = contourAt(contour, t1);
          const rc2 = contourAt(contour, t2);
          let targetSlopeAhead: number | null = null;
          if (rc1 !== null && rc2 !== null) {
            const p1 = mapReciterToUser(rc1, reciterAnchors, userAnchors);
            const p2 = mapReciterToUser(rc2, reciterAnchors, userAnchors);
            targetSlopeAhead = (p2 - p1) / (t2 - t1);
          }
          const newCue = cueEngineRef.current.update({
            tMs: performance.now(),
            errorCents,
            targetSlopeAhead,
          });
          if (newCue !== lastCueRef.current) {
            lastCueRef.current = newCue;
            onCueChangeRef.current(newCue);
          }
          if (errorCents !== null && statsRef.current) {
            const stats = statsRef.current;
            stats.frames += 1;
            const abs = Math.abs(errorCents);
            if (abs <= 150) stats.within150 += 1;
            if (abs <= 60) stats.within60 += 1;
          }
        }
      } else if (mode === "shadow" && lastCueRef.current !== null) {
        lastCueRef.current = null;
        onCueChangeRef.current(null);
      }

      // prune + draw trail (fading dots behind the playhead)
      trailRef.current = trailRef.current.filter((p) => p.t >= tSec - TRAIL_MAX_AGE);
      for (const p of trailRef.current) {
        const age = tSec - p.t;
        if (age < 0) continue;
        const alpha = Math.max(0, 1 - age / TRAIL_MAX_AGE) * 0.8;
        let err: number | null = null;
        if (mode === "shadow") {
          const raw = contourAt(contour, p.t);
          const targetAtP = raw !== null ? mapReciterToUser(raw, reciterAnchors, userAnchors) : null;
          err = targetAtP !== null ? p.cents - targetAtP : null;
        }
        ctx2d.fillStyle = errorColor(err, colors);
        ctx2d.globalAlpha = alpha;
        ctx2d.beginPath();
        ctx2d.arc(timeToX(p.t), centsToY(p.cents), 2.5, 0, Math.PI * 2);
        ctx2d.fill();
      }
      ctx2d.globalAlpha = 1;

      // --- live dot at the playhead ---
      if (userC !== null) {
        ctx2d.fillStyle = errorColor(errorCents, colors);
        ctx2d.beginPath();
        ctx2d.arc(playheadX, centsToY(userC), 6, 0, Math.PI * 2);
        ctx2d.fill();
      }
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [contour, userAnchors, getPlaybackTimeSec, isPlayingRef, micReadingRef, statsRef, mode]);

  return <canvas ref={canvasRef} className={styles.canvas} style={{ height: CANVAS_HEIGHT }} />;
}
