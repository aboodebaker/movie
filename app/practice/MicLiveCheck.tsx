"use client";

import { useEffect, useRef, useState } from "react";
import type { PitchReading } from "@/lib/audio/micPitch";

/**
 * Small live "we can hear you" strip shown while recording: a level bar and
 * a voiced-seconds counter, so a silent mic is obvious immediately instead
 * of surfacing as "not enough voiced audio" after the take.
 */
export default function MicLiveCheck({
  micReadingRef,
}: {
  micReadingRef: React.RefObject<PitchReading | null>;
}) {
  const [level, setLevel] = useState(0);
  const [voicedSec, setVoicedSec] = useState(0);
  const voicedMsRef = useRef(0);
  const lastTMsRef = useRef<number | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      const r = micReadingRef.current;
      if (!r) return;
      setLevel(r.level);
      if (lastTMsRef.current !== null && r.cents !== null) {
        voicedMsRef.current += Math.min(r.tMs - lastTMsRef.current, 250);
      }
      lastTMsRef.current = r.tMs;
      setVoicedSec(voicedMsRef.current / 1000);
    }, 150);
    return () => clearInterval(id);
  }, [micReadingRef]);

  const heard = voicedSec >= 0.5;
  const pct = Math.min(level * 900, 100);

  return (
    <div
      aria-live="polite"
      style={{ display: "flex", alignItems: "center", gap: "0.7rem", minWidth: 0 }}
    >
      <div
        style={{
          width: 90,
          height: 8,
          borderRadius: 4,
          background: "var(--border)",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: pct > 3 ? "var(--green)" : "var(--red)",
            transition: "width 120ms linear",
          }}
        />
      </div>
      <span className="muted" style={{ fontSize: "0.9rem", whiteSpace: "nowrap" }}>
        {heard
          ? `hearing you — ${voicedSec.toFixed(0)}s of voice`
          : "waiting to hear your voice…"}
      </span>
    </div>
  );
}
