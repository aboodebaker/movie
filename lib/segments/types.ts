/**
 * Word-level timing for one ayah, sourced from the Quran.com v4 API for
 * reciters where it's available (see lib/segments/server.ts). Consumed by
 * the practice screen's word strip and stashed for later per-word review
 * (spec §5.4 solo mode).
 */

export interface WordTiming {
  /** 0-based position among "word" tokens (the ayah-number end marker is excluded). */
  index: number;
  textUthmani: string;
  startSec: number;
  endSec: number;
}

export interface AyahWords {
  /** Same-origin proxied URL of the exact audio file these timings were measured against. */
  audioUrl: string;
  words: WordTiming[];
}
