"use client";

import type { PitchReading } from "@/lib/audio/micPitch";
import styles from "./calibrate.module.css";

// A plausible display range in cents (vs F_REF = 110 Hz), wide enough to
// cover a low male hum through a higher child/female voice without the dot
// pinning to an edge for most people. Purely cosmetic — no pitch maths here.
const RANGE_LOW = -700;
const RANGE_HIGH = 1900;

function toPercent(cents: number): number {
  const pct = ((cents - RANGE_LOW) / (RANGE_HIGH - RANGE_LOW)) * 100;
  return Math.min(100, Math.max(0, pct));
}

interface Props {
  reading: PitchReading | null;
}

/** Live feedback strip: a pitch dot riding a horizontal track, plus a mic level meter. */
export default function PitchMeter({ reading }: Props) {
  const hasPitch = reading != null && reading.cents !== null;
  const dotPct = hasPitch ? toPercent(reading!.cents as number) : null;
  // reading.level is a raw RMS (~0.005 to ~0.3 in normal speech); scale up
  // for a readable meter and clamp.
  const levelPct = reading ? Math.min(100, Math.max(0, reading.level * 500)) : 0;

  return (
    <div className={styles.meter}>
      <div className={styles.pitchTrack}>
        <div className={styles.pitchTrackFill} />
        {dotPct !== null ? (
          <div className={styles.pitchDot} style={{ left: `${dotPct}%` }} />
        ) : (
          <div className={styles.pitchHint}>
            {reading ? "no clear pitch — hum a steady tone" : "listening…"}
          </div>
        )}
      </div>
      <div className={styles.levelRow}>
        <span className={styles.levelLabel}>mic level</span>
        <div className={styles.levelTrack}>
          <div className={styles.levelFill} style={{ width: `${levelPct}%` }} />
        </div>
      </div>
    </div>
  );
}
