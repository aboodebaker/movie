/**
 * Client-side fetch for one ayah's word timing (see app/api/segments).
 * Returns null on a clean 404 (reciter/ayah unsupported) so callers can fall
 * back to the whole-ayah path without treating it as an error; throws on
 * genuine network/server failure.
 */
import { segmentsUrl } from "@/data/surahs";
import type { AyahWords } from "./types";

export async function fetchAyahWords(
  reciterId: string,
  surah: number,
  ayah: number,
): Promise<AyahWords | null> {
  const res = await fetch(segmentsUrl(reciterId, surah, ayah));
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Couldn't fetch word timing (${res.status}).`);
  }
  return (await res.json()) as AyahWords;
}
