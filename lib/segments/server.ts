/**
 * Server-only helpers for fetching word-level timing from the Quran.com v4
 * API. Consumed by app/api/segments and app/api/qaudio route handlers only —
 * never imported client-side (it makes cross-origin fetches that need a
 * server context and would be blocked by CORS in the browser anyway).
 *
 * ## Segment tuple format (research conclusion, verified 2026-07-14)
 * `GET /recitations/{id}/by_ayah/{s}:{a}?fields=segments` returns
 * `audio_files[0].segments: number[][]`, each tuple
 * `[wordStart, wordEnd, startMs, endMs]` where `wordStart`/`wordEnd` are a
 * **0-based, half-open range** over the ayah's "word" tokens (the trailing
 * ayah-number "end" marker from the /verses endpoint is not counted), and
 * `startMs`/`endMs` are milliseconds into *that recitation's own audio
 * file*. Evidence:
 *   - 1:1 (4 words) under recitations 6/7/2/9 each returned exactly 4
 *     segments `[0,1,..],[1,2,..],[2,3,..],[3,4,..]` — one word per segment,
 *     ranges tiling 0..4 with no gaps.
 *   - 1:7 (9 words) and 112:1 (4 words) matched the same pattern for all
 *     four reciters; ms values were strictly increasing across every case.
 *   - Recitation 5 (Hani ar-Rifai, not one of our reciters) returned
 *     `[[0,2,0,1810],[2,3,..],[3,4,..]]` for 1:1 — only 3 segments for 4
 *     words, first tuple spanning word range [0,2). This is what proves the
 *     tuple is a *range*, not always one word.
 *   - Recitation 2 (AbdulBasit) on 1:4 (3 words) returned a single segment
 *     `[[0,3,0,4573]]` — all three words merged into one timed span. This
 *     multi-word case is handled by splitting the span across its words
 *     proportionally by Uthmani character count (see splitSegmentAcrossWords).
 *
 * The `url` field on the same audio_files entry is either absolute
 * (`https://...`), protocol-relative (`//mirrors.quranicaudio.com/...`), or
 * relative to `https://verses.quran.com/` — all three forms were observed
 * across our four reciters (Husary uses a mirrors.quranicaudio.com host;
 * Alafasy/AbdulBasit/Minshawi use relative paths). See resolveUpstreamAudioUrl.
 */

import { RECITERS } from "@/data/surahs";
import type { WordTiming } from "./types";

const QURAN_API_BASE = "https://api.quran.com/api/v4";

/** Hosts we'll actually fetch audio bytes from, resolved from API responses. */
export const ALLOWED_AUDIO_HOSTS = new Set([
  "verses.quran.com",
  "mirrors.quranicaudio.com",
]);

interface RawAudioFile {
  verse_key: string;
  url: string;
  segments?: number[][];
}

interface RawWord {
  position: number;
  char_type_name: string;
  text_uthmani: string;
}

/** Resolve a Quran.com `url` field (absolute / protocol-relative / relative) to an absolute URL. */
export function resolveUpstreamAudioUrl(raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("//")) return `https:${raw}`;
  return `https://verses.quran.com/${raw.replace(/^\/+/, "")}`;
}

export function lookupRecitationId(reciterId: string): number | null {
  const reciter = RECITERS.find((r) => r.id === reciterId);
  return reciter?.quranComRecitationId ?? null;
}

/** Fetch the {url, segments} pair for one ayah under a Quran.com recitation id. Null on any failure/miss. */
async function fetchAudioFile(
  recitationId: number,
  surah: number,
  ayah: number,
): Promise<RawAudioFile | null> {
  try {
    const res = await fetch(
      `${QURAN_API_BASE}/recitations/${recitationId}/by_ayah/${surah}:${ayah}?fields=segments`,
      { cache: "force-cache" },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { audio_files?: RawAudioFile[] };
    return data.audio_files?.[0] ?? null;
  } catch {
    return null;
  }
}

/** Fetch the ordered "word" tokens (Uthmani text) for one ayah, excluding the end/pause markers. Null on failure. */
async function fetchWordTexts(surah: number, ayah: number): Promise<RawWord[] | null> {
  try {
    const res = await fetch(
      `${QURAN_API_BASE}/verses/by_key/${surah}:${ayah}?words=true&word_fields=text_uthmani`,
      { cache: "force-cache" },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { verse?: { words?: RawWord[] } };
    const words = data.verse?.words;
    if (!words) return null;
    return words.filter((w) => w.char_type_name === "word");
  } catch {
    return null;
  }
}

/**
 * Expand one segment tuple into per-word timings. A single-word segment
 * (wordEnd - wordStart === 1) maps directly. A multi-word segment splits its
 * time span across the covered words proportionally by Uthmani character
 * count — an approximation (we have no finer ground truth), but it keeps
 * highlighting roughly in step rather than freezing on the first word of
 * the merged group for its whole duration.
 */
function splitSegmentAcrossWords(
  wordStart: number,
  wordEnd: number,
  startMs: number,
  endMs: number,
  words: RawWord[],
): WordTiming[] {
  const span = words.slice(wordStart, wordEnd);
  if (span.length === 0) return [];
  const weights = span.map((w) => Math.max(1, w.text_uthmani.length));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const totalMs = Math.max(0, endMs - startMs);

  const out: WordTiming[] = [];
  let cursorMs = startMs;
  for (let i = 0; i < span.length; i++) {
    const shareMs = (weights[i] / totalWeight) * totalMs;
    const wordStartMs = cursorMs;
    const wordEndMs = i === span.length - 1 ? endMs : cursorMs + shareMs;
    out.push({
      index: wordStart + i,
      textUthmani: span[i].text_uthmani,
      startSec: wordStartMs / 1000,
      endSec: wordEndMs / 1000,
    });
    cursorMs = wordEndMs;
  }
  return out;
}

export interface BuiltAyahWords {
  /** Absolute upstream URL of the exact audio file the timings were measured against. */
  upstreamAudioUrl: string;
  words: WordTiming[];
}

/**
 * Build word timings for one reciter/surah/ayah, or null when unsupported:
 * no Quran.com recitation mapped for this reciter, the upstream has no
 * segments for this ayah, or the segments don't sanely cover the verse's
 * words. Callers (the /api/segments route) turn null into a clean 404 so
 * the client falls back to the whole-ayah EveryAyah path.
 */
export async function buildAyahWords(
  reciterId: string,
  surah: number,
  ayah: number,
): Promise<BuiltAyahWords | null> {
  const recitationId = lookupRecitationId(reciterId);
  if (recitationId === null) return null;

  const [audioFile, wordTexts] = await Promise.all([
    fetchAudioFile(recitationId, surah, ayah),
    fetchWordTexts(surah, ayah),
  ]);
  if (!audioFile || !audioFile.url || !audioFile.segments || audioFile.segments.length === 0) {
    return null;
  }
  if (!wordTexts || wordTexts.length === 0) return null;

  const words: WordTiming[] = [];
  for (const seg of audioFile.segments) {
    if (seg.length < 4) continue;
    const [wordStart, wordEnd, startMs, endMs] = seg;
    if (
      !Number.isFinite(wordStart) ||
      !Number.isFinite(wordEnd) ||
      wordEnd <= wordStart ||
      wordStart < 0 ||
      wordEnd > wordTexts.length
    ) {
      continue;
    }
    words.push(...splitSegmentAcrossWords(wordStart, wordEnd, startMs, endMs, wordTexts));
  }

  // Sanity: expect every word covered, in order, non-decreasing time.
  if (words.length !== wordTexts.length) return null;
  for (let i = 0; i < words.length; i++) {
    if (words[i].index !== i) return null;
    if (i > 0 && words[i].startSec < words[i - 1].startSec) return null;
  }

  return { upstreamAudioUrl: resolveUpstreamAudioUrl(audioFile.url), words };
}

/** Resolve just the upstream audio URL (for the qaudio proxy), without the words fetch. */
export async function resolveAyahAudioUrl(
  reciterId: string,
  surah: number,
  ayah: number,
): Promise<string | null> {
  const recitationId = lookupRecitationId(reciterId);
  if (recitationId === null) return null;
  const audioFile = await fetchAudioFile(recitationId, surah, ayah);
  if (!audioFile?.url) return null;
  return resolveUpstreamAudioUrl(audioFile.url);
}
