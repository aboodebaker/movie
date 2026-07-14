"use client";

import { useRef, useState } from "react";
import { ayahAudioUrl } from "@/data/surahs";
import { explain, type RankedReciter } from "./scoring";
import type { StyleVector } from "./styleVector";
import styles from "./match.module.css";

interface Props {
  rank: number | null;
  reciterName: string;
  reciterId: string;
  result: RankedReciter;
  reciterStyle: StyleVector;
  userStyle: StyleVector;
  userAudioUrl: string | null;
  onPractice: (reciterId: string) => void;
}

type Playing = "reciter" | "user" | null;

export default function ReciterCard({
  rank,
  reciterName,
  reciterId,
  result,
  reciterStyle,
  userStyle,
  userAudioUrl,
  onPractice,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<Playing>(null);

  const ensureAudio = (): HTMLAudioElement => {
    if (!audioRef.current) audioRef.current = new Audio();
    return audioRef.current;
  };

  const stopAudio = () => {
    audioRef.current?.pause();
    setPlaying(null);
  };

  const playReciter = () => {
    const a = ensureAudio();
    a.pause();
    a.src = ayahAudioUrl(reciterId, 1, 1);
    a.onended = () => setPlaying(null);
    void a.play();
    setPlaying("reciter");
  };

  const playUser = () => {
    if (!userAudioUrl) return;
    const a = ensureAudio();
    a.pause();
    a.src = userAudioUrl;
    a.onended = () => setPlaying(null);
    void a.play();
    setPlaying("user");
  };

  const failed = !result.rangeFit.passes;
  const overallPct = Math.round(result.overall * 100);
  const firstName = reciterName.split(" ")[0];

  return (
    <div className={`card ${styles.reciterCard} ${failed ? styles.failedCard : ""}`}>
      <div className={styles.cardHeader}>
        <span className={styles.rank}>{rank ? `#${rank}` : "—"}</span>
        <h3 className={styles.reciterName}>{reciterName}</h3>
        {!failed && <span className={styles.overallPct}>{overallPct}%</span>}
      </div>

      {failed && <p className={styles.failedLabel}>outside your comfortable range</p>}

      <div className={styles.bars}>
        <BarRow label="Range fit" value={result.rangeFit.fitScore} color="var(--green)" />
        <BarRow label="Style similarity" value={result.styleScore.score} color="var(--gold)" />
        <BarRow label="Timbre" value={0} color="var(--text-dim)" greyed note="needs backend" />
      </div>

      <p className={styles.explain}>{explain(result, reciterStyle, userStyle)}</p>

      <div className={styles.cardControls}>
        <button className="ghost" onClick={playing === "reciter" ? stopAudio : playReciter}>
          {playing === "reciter" ? "■ Stop" : `▶ Hear ${firstName}`}
        </button>
        <button
          className="ghost"
          onClick={playing === "user" ? stopAudio : playUser}
          disabled={!userAudioUrl}
        >
          {playing === "user" ? "■ Stop" : "▶ Hear yourself"}
        </button>
        <button className="primary" onClick={() => onPractice(reciterId)}>
          Practice with him →
        </button>
      </div>
    </div>
  );
}

function BarRow({
  label,
  value,
  color,
  greyed,
  note,
}: {
  label: string;
  value: number;
  color: string;
  greyed?: boolean;
  note?: string;
}) {
  return (
    <div className={styles.barRow}>
      <span className={styles.barLabel}>
        {label}
        {note && <span className={styles.barNote}> ({note})</span>}
      </span>
      <div className={styles.barTrack}>
        <div
          className={styles.barFill}
          style={{
            width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`,
            background: color,
            opacity: greyed ? 0.35 : 1,
          }}
        />
      </div>
    </div>
  );
}
