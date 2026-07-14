/**
 * Client-side cache of decoded reference clips: fetch the same-origin audio
 * proxy, decode it, and run the (client-side, Phase-1) contour extraction.
 * Keyed by reciter/surah/ayah so switching back and forth is instant after
 * the first load. Module-level so it survives component re-renders (but not
 * a full page reload — that's fine, extraction is only ~1s per clip).
 */
import { ayahAudioUrl } from "@/data/surahs";
import { extractContour, type Contour } from "@/lib/contour/extract";

export interface ClipData {
  buffer: AudioBuffer;
  contour: Contour;
}

type CacheEntry =
  | { status: "loading"; promise: Promise<ClipData> }
  | { status: "ready"; data: ClipData }
  | { status: "error"; error: string };

const cache = new Map<string, CacheEntry>();

function keyOf(reciterId: string, surah: number, ayah: number): string {
  return `${reciterId}|${surah}|${ayah}`;
}

/** Fetch + decode + extract, de-duplicating concurrent requests for the same clip. */
export async function loadClip(
  audioCtx: BaseAudioContext,
  reciterId: string,
  surah: number,
  ayah: number,
): Promise<ClipData> {
  const key = keyOf(reciterId, surah, ayah);
  const existing = cache.get(key);
  if (existing?.status === "ready") return existing.data;
  if (existing?.status === "loading") return existing.promise;

  const promise = (async (): Promise<ClipData> => {
    const res = await fetch(ayahAudioUrl(reciterId, surah, ayah));
    if (!res.ok) {
      throw new Error(
        res.status === 404
          ? "This clip isn't available from the source."
          : `Couldn't fetch the audio (${res.status}). Try again.`,
      );
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = await audioCtx.decodeAudioData(arrayBuffer);
    const contour = extractContour(buffer);
    return { buffer, contour };
  })();

  cache.set(key, { status: "loading", promise });
  try {
    const data = await promise;
    cache.set(key, { status: "ready", data });
    return data;
  } catch (e) {
    cache.set(key, { status: "error", error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}
