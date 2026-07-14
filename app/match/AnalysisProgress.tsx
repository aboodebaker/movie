import type { AnalysisProgress as Progress } from "./reciterFeatures";
import styles from "./match.module.css";

interface Props {
  progress: Progress | null;
}

/** First-run progress UI while the four reciters' Al-Fatihah features are
 * being built client-side; cached afterwards so this only happens once. */
export default function AnalysisProgress({ progress }: Props) {
  const pct =
    progress && progress.overallTotal > 0
      ? Math.round((progress.overallDone / progress.overallTotal) * 100)
      : 0;

  return (
    <div className="card">
      <h2 style={{ margin: "0.2rem 0 0.5rem" }}>Analysing the reciters</h2>
      <p className="muted">
        One-time setup: listening to each reciter&apos;s Al-Fatihah to learn
        his range and melodic style. This is cached on this device, so it
        only happens once.
      </p>
      <div className={styles.levelTrack} style={{ marginTop: "0.9rem" }}>
        <div
          className={styles.levelFill}
          style={{ width: `${pct}%`, background: "var(--gold)" }}
        />
      </div>
      <p aria-live="polite" className={styles.liveStatus}>
        {progress
          ? `Analysing ${progress.reciterName} — ayah ${progress.ayahIndex}/${progress.ayahCount} (${progress.overallDone}/${progress.overallTotal} overall)`
          : "Starting…"}
      </p>
    </div>
  );
}
