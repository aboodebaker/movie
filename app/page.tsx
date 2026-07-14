"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  loadProfile,
  profileIsStale,
  type VoiceProfile,
} from "@/lib/profile/store";

export default function Home() {
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
    setLoaded(true);
  }, []);

  return (
    <>
      <h1 style={{ margin: "0.5rem 0" }}>Recitation Coach</h1>
      <p className="muted">
        Calibrate your range once, then follow your reciter through an ayah —
        his contour projected into <em>your</em> voice, with live, kind cues.
        Everything runs on this device; no audio is uploaded.
      </p>

      {loaded && (
        <div className="card">
          {profile ? (
            <>
              <p>
                <strong>Voice profile:</strong> calibrated{" "}
                {new Date(profile.calibratedAt).toLocaleDateString()} · band{" "}
                {Math.round(profile.anchors.high - profile.anchors.low)} cents
                wide
                {profileIsStale(profile) && (
                  <span style={{ color: "var(--red)" }}>
                    {" "}
                    — over a month old, re-calibrate
                  </span>
                )}
              </p>
              <p style={{ marginTop: "0.75rem" }}>
                <Link href="/practice">
                  <button className="primary">Practice →</button>
                </Link>{" "}
                <Link href="/match">
                  <button className="ghost">Find my reciter →</button>
                </Link>{" "}
                <Link href="/calibrate">
                  <button className="ghost">Re-calibrate</button>
                </Link>
              </p>
            </>
          ) : (
            <>
              <p>
                <strong>No voice profile yet.</strong> Start with the
                ninety-second voice check — it measures your comfortable low,
                middle and high, and every practice lane is drawn from it.
              </p>
              <p style={{ marginTop: "0.75rem" }}>
                <Link href="/calibrate">
                  <button className="primary">Calibrate my voice →</button>
                </Link>
              </p>
            </>
          )}
        </div>
      )}

      <div className="card muted" style={{ fontSize: "0.9rem" }}>
        <p>
          <strong style={{ color: "var(--text)" }}>How it works:</strong> the
          reciter&apos;s melody is converted to cents and normalised to his own
          range, then projected into yours — his high is <em>your</em> high,
          not his frequency. You follow the gold line; the dot is your live
          pitch. Guidance, never grading.
        </p>
      </div>
    </>
  );
}
