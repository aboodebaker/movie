"use client";

import Link from "next/link";
import type { VoiceProfile } from "@/lib/profile/store";
import { centsToNoteName } from "./notes";
import styles from "./calibrate.module.css";

interface Props {
  profile: VoiceProfile;
  onStartOver: () => void;
}

export default function ResultsCard({ profile, onStartOver }: Props) {
  const width = Math.round(profile.anchors.high - profile.anchors.low);
  const semitones = (width / 100).toFixed(1);

  return (
    <div className="card">
      <h2 style={{ margin: "0.2rem 0 0.5rem" }}>Your voice profile</h2>
      <p className="muted">
        Calibrated just now and saved on this device. Every practice lane is
        drawn from this — it&apos;s a map of your own comfortable range, not a
        target to hit.
      </p>

      <div className={styles.resultsGrid}>
        <div className={styles.statTile}>
          <div className={styles.statLabel}>Comfortable low</div>
          <div className={styles.statValue}>{centsToNoteName(profile.anchors.low)}</div>
        </div>
        <div className={styles.statTile}>
          <div className={styles.statLabel}>Comfortable middle</div>
          <div className={styles.statValue}>{centsToNoteName(profile.anchors.mid)}</div>
        </div>
        <div className={styles.statTile}>
          <div className={styles.statLabel}>Comfortable high</div>
          <div className={styles.statValue}>{centsToNoteName(profile.anchors.high)}</div>
        </div>
      </div>

      <p style={{ marginTop: "1rem" }}>
        Comfortable band: <strong>{width} cents</strong> wide (~{semitones}{" "}
        semitones) · Steadiness while sustaining a note:{" "}
        <strong>{Math.round(profile.wobble)} cents</strong> of natural wobble.
      </p>
      <p className="muted" style={{ marginTop: "0.4rem", fontSize: "0.9rem" }}>
        Absolute range seen today: {centsToNoteName(profile.absoluteLow)} to{" "}
        {centsToNoteName(profile.absoluteHigh)}.
      </p>

      <p style={{ marginTop: "1.1rem" }}>
        <Link href="/practice">
          <button className="primary">Start practising →</button>
        </Link>{" "}
        <button className="ghost" onClick={onStartOver}>
          Redo calibration
        </button>
      </p>
    </div>
  );
}
