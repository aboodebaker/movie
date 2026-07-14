/**
 * Dynamic time warping on cent contours (spec §7.4). Plain JS is fine at our
 * scale: an ayah is a few hundred to ~1500 frames, and the banded DP keeps
 * the work near-linear.
 */

export interface DtwResult {
  /** matched index pairs [iA, iB], monotonically non-decreasing */
  path: [number, number][];
  /** total cost normalised by path length */
  normalizedDistance: number;
}

/**
 * Banded DTW between two numeric sequences using |a-b| local cost.
 * `windowFrac` is the Sakoe-Chiba band half-width as a fraction of the longer
 * sequence (0.15 ≈ allow ±15% timing drift). Unvoiced frames should be
 * bridged by the caller (see `bridgeGaps`) before alignment.
 */
export function dtw(
  a: number[],
  b: number[],
  windowFrac: number = 0.15,
): DtwResult {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return { path: [], normalizedDistance: Infinity };

  const w = Math.max(Math.ceil(Math.max(n, m) * windowFrac), Math.abs(n - m) + 1);
  const INF = Number.POSITIVE_INFINITY;
  // cost matrix, band only; row-major [n+1][m+1] flattened
  const D = new Float64Array((n + 1) * (m + 1)).fill(INF);
  D[0] = 0;
  const idx = (i: number, j: number) => i * (m + 1) + j;

  for (let i = 1; i <= n; i++) {
    const jLo = Math.max(1, i - w);
    const jHi = Math.min(m, i + w);
    for (let j = jLo; j <= jHi; j++) {
      const cost = Math.abs(a[i - 1] - b[j - 1]);
      const best = Math.min(D[idx(i - 1, j)], D[idx(i, j - 1)], D[idx(i - 1, j - 1)]);
      D[idx(i, j)] = cost + best;
    }
  }

  // backtrack
  const path: [number, number][] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    path.push([i - 1, j - 1]);
    const diag = D[idx(i - 1, j - 1)];
    const up = D[idx(i - 1, j)];
    const left = D[idx(i, j - 1)];
    if (diag <= up && diag <= left) {
      i--;
      j--;
    } else if (up <= left) {
      i--;
    } else {
      j--;
    }
  }
  path.reverse();

  const total = D[idx(n, m)];
  return {
    path,
    normalizedDistance: Number.isFinite(total) ? total / path.length : Infinity,
  };
}

/**
 * Replace nulls (unvoiced frames) by linear interpolation between voiced
 * neighbours so DTW can run on a dense sequence; edges take the nearest
 * voiced value. Returns null if the sequence has no voiced frames at all.
 */
export function bridgeGaps(values: (number | null)[]): number[] | null {
  const n = values.length;
  const out = new Array<number>(n);
  let firstVoiced = -1;
  let lastVoiced = -1;
  for (let i = 0; i < n; i++) {
    if (values[i] !== null) {
      if (firstVoiced === -1) firstVoiced = i;
      lastVoiced = i;
    }
  }
  if (firstVoiced === -1) return null;

  let prev = firstVoiced;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v !== null) {
      out[i] = v;
      prev = i;
    } else if (i < firstVoiced) {
      out[i] = values[firstVoiced] as number;
    } else if (i > lastVoiced) {
      out[i] = values[lastVoiced] as number;
    } else {
      let next = i + 1;
      while (values[next] === null) next++;
      const a = values[prev] as number;
      const b = values[next] as number;
      out[i] = a + ((b - a) * (i - prev)) / (next - prev);
    }
  }
  return out;
}

/**
 * For each reference index, the median matched user index — a monotone map
 * from reference frames to user frames, for translating word boundaries.
 */
export function refToUserMap(path: [number, number][], refLen: number): number[] {
  const buckets: number[][] = Array.from({ length: refLen }, () => []);
  for (const [iUser, jRef] of path) buckets[jRef]?.push(iUser);
  const map = new Array<number>(refLen);
  let last = 0;
  for (let j = 0; j < refLen; j++) {
    const b = buckets[j];
    if (b && b.length > 0) {
      last = b[Math.floor(b.length / 2)];
    }
    map[j] = last;
  }
  return map;
}
