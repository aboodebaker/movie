"use client";

import { useSyncExternalStore } from "react";
import { loadProfile, type VoiceProfile } from "@/lib/profile/store";

// Module-level cache so getSnapshot returns a referentially stable value
// when the underlying localStorage content hasn't changed — required by
// useSyncExternalStore to avoid re-render loops (loadProfile() otherwise
// parses fresh JSON, and thus a fresh object, on every call).
let cachedKey = "";
let cachedSnapshot: VoiceProfile | null = null;

function getSnapshot(): VoiceProfile | null {
  const next = loadProfile();
  const key = next ? JSON.stringify(next) : "";
  if (key === cachedKey) return cachedSnapshot;
  cachedKey = key;
  cachedSnapshot = next;
  return next;
}

function getServerSnapshot(): VoiceProfile | null {
  return null;
}

function subscribe(onStoreChange: () => void): () => void {
  // Picks up calibration done in another tab, for free.
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

/**
 * Reads the calibrated voice profile from localStorage via
 * useSyncExternalStore rather than an effect + setState. This is the
 * React-recommended way to read an external, possibly-absent-during-SSR
 * source: no manual "loaded" flag, no hydration mismatch, and no
 * synchronous setState-in-effect (which the repo's lint config now flags).
 */
export function useVoiceProfile(): VoiceProfile | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
