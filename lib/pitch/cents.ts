/**
 * All pitch maths live in cents relative to a fixed reference, never raw Hz.
 * Melodies are equivalent under transposition, so contours are compared as
 * normalised shapes (see TECHNICAL_SPECIFICATION.md §4).
 */

export const F_REF = 110; // A2 — arbitrary fixed reference for cent conversion

export function hzToCents(hz: number, fRef: number = F_REF): number {
  return 1200 * Math.log2(hz / fRef);
}

export function centsToHz(cents: number, fRef: number = F_REF): number {
  return fRef * Math.pow(2, cents / 1200);
}

/** Linear-interpolated percentile of an unsorted sample. p in [0, 100]. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Voice anchors in cents: low/mid/high = P15/P50/P85 of voiced frames. */
export interface Anchors {
  low: number;
  mid: number;
  high: number;
}

export function computeAnchors(voicedCents: number[]): Anchors {
  return {
    low: percentile(voicedCents, 15),
    mid: percentile(voicedCents, 50),
    high: percentile(voicedCents, 85),
  };
}

/**
 * Normalise a cent value to a dimensionless shape coordinate relative to a
 * singer's own anchors: r = (c − mid) / (high − low).
 */
export function normalizeToAnchors(cents: number, a: Anchors): number {
  const span = a.high - a.low;
  if (span <= 0) return 0;
  return (cents - a.mid) / span;
}

/**
 * Project a normalised shape coordinate into a target voice:
 * target = mid_u + r · (high_u − low_u).  "His high is your high."
 */
export function projectToVoice(r: number, user: Anchors): number {
  return user.mid + r * (user.high - user.low);
}

/** Convenience: map a reciter cent value directly into the user's range. */
export function mapReciterToUser(
  reciterCents: number,
  reciter: Anchors,
  user: Anchors,
): number {
  return projectToVoice(normalizeToAnchors(reciterCents, reciter), user);
}
