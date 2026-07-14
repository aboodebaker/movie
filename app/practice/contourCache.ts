/**
 * Client-side cache of decoded reference clips: fetch the same-origin audio
 * proxy, decode it, and run the (client-side, Phase-1) contour extraction.
 * Keyed by reciter/surah/ayah so switching back and forth is instant after
 * the first load. Module-level so it survives component re-renders (but not
 * a full page reload — that's fine, extraction is only ~1s per clip).
 *
 * When word-level timing exists for the reciter (see lib/segments), the
 * *Quran.com* audio file is fetched and decoded instead of the EveryAyah
 * one, because the timestamps only match the exact file they were measured
 * against (docs/TECHNICAL_SPECIFICATION.md §5). The contour is always
 * extracted from whichever buffer actually plays. When no timing is
 * available, this is exactly the old EveryAyah-only behaviour.
 */
import { ayahAudioUrl } from "@/data/surahs";
import { extractContour, type Contour } from "@/lib/contour/extract";
import { fetchAyahWords } from "@/lib/segments/client";
import type { WordTiming } from "@/lib/segments/types";

export interface ClipData {
  buffer: AudioBuffer;
  contour: Contour;
  /** Word-level timing for this exact clip, or null when unsupported (whole-ayah fallback). */
  words: WordTiming[] | null;
  /** Which audio source the buffer/contour/words were derived from. */
  audioSource: "quran.com" | "everyayah";
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
    // Word timing determines which audio file to play: if available, its
    // audioUrl (same-origin, proxied to Quran.com) is the one whose
    // timestamps the words were measured against — the EveryAyah clip
    // would silently desync. Any failure here (network, unsupported
    // reciter) just means no word timing, not a fatal error.
    let words: WordTiming[] | null = null;
    let audioUrl = ayahAudioUrl(reciterId, surah, ayah);
    let audioSource: ClipData["audioSource"] = "everyayah";
    try {
      const ayahWords = await fetchAyahWords(reciterId, surah, ayah);
      if (ayahWords && ayahWords.words.length > 0) {
        words = ayahWords.words;
        audioUrl = ayahWords.audioUrl;
        audioSource = "quran.com";
      }
    } catch {
      // Segments unavailable — fall back to the whole-ayah EveryAyah path.
    }

    let res = await fetch(audioUrl);
    if (!res.ok && audioSource === "quran.com") {
      // The words lookup succeeded but the paired audio proxy didn't (e.g.
      // upstream hiccup) — don't strand the user without any clip, fall
      // back to the EveryAyah file and drop the (now mismatched) words.
      words = null;
      audioSource = "everyayah";
      audioUrl = ayahAudioUrl(reciterId, surah, ayah);
      res = await fetch(audioUrl);
    }
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
    return { buffer, contour, words, audioSource };
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
