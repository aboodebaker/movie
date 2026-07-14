import type { Anchors } from "@/lib/pitch/cents";

/**
 * The calibrated voice profile. Stored locally only (localStorage) — nothing
 * leaves the device in Phase 1, per the privacy posture in the spec (§10).
 */
export interface VoiceProfile {
  /** Comfortable band + median, in cents (P15/P50/P85 of voiced frames). */
  anchors: Anchors;
  /** Absolute observed limits in cents, from the glide task. */
  absoluteLow: number;
  absoluteHigh: number;
  /** Std-dev of pitch error while sustaining, in cents — tunes cue thresholds. */
  wobble: number;
  /** ISO timestamp; profiles older than ~1 month should prompt recalibration. */
  calibratedAt: string;
}

const KEY = "recitation-coach:voice-profile";

export function loadProfile(): VoiceProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as VoiceProfile;
    if (!p.anchors || !Number.isFinite(p.anchors.mid)) return null;
    return p;
  } catch {
    return null;
  }
}

export function saveProfile(profile: VoiceProfile): void {
  window.localStorage.setItem(KEY, JSON.stringify(profile));
}

export function clearProfile(): void {
  window.localStorage.removeItem(KEY);
}

export function profileIsStale(p: VoiceProfile): boolean {
  const age = Date.now() - new Date(p.calibratedAt).getTime();
  return age > 32 * 24 * 60 * 60 * 1000; // ~1 month
}
