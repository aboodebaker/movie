/**
 * Match Engine scoring (spec §4): a hard range gate, a 0-1 range-fit score,
 * a 0-1 style-similarity score, and a user-weighted blend. Timbre is
 * deliberately absent — it needs the server-side speaker-embedding model
 * (Phase 2 backend) and is shown as a greyed "needs backend" bar in the UI
 * rather than faked here.
 */
import type { VoiceProfile } from "@/lib/profile/store";
import type { ReciterFeatures } from "./reciterFeatures";
import type { StyleVector } from "./styleVector";

// Small stretch allowance beyond the user's observed absolute limits (§4).
const STRETCH_CENTS = 100;
// Range-fit score is 1 while the projected extent uses up to this fraction
// of the gated range, then tapers linearly to 0 at the gate edge.
const COMFORT_USAGE = 0.8;

export interface RangeFit {
  passes: boolean;
  projectedLow: number;
  projectedHigh: number;
  projectedExtent: number;
  /** Fraction of the gated (stretched) range the projected extent occupies. */
  usage: number;
  /** 0 if it fails the gate; otherwise 1 down to 0 as usage nears the edge. */
  fitScore: number;
}

/**
 * The range-mapping formula from spec §4, applied to a reciter's full P5-P95
 * extent rather than a single point:
 *   normalise the reciter's P5-P95 extent by his own P15-P85 band, project
 *   onto the user's P15-P85 band width, then check that extent — centred on
 *   the user's own median — stays inside the user's absolute limits (+ a
 *   small stretch allowance).
 */
export function computeRangeFit(reciter: ReciterFeatures, user: VoiceProfile): RangeFit {
  const reciterBand = reciter.anchors.high - reciter.anchors.low;
  const reciterExtent = reciter.extentHigh - reciter.extentLow;
  const userBand = user.anchors.high - user.anchors.low;

  const normalizedExtent = reciterBand > 0 ? reciterExtent / reciterBand : 1;
  const projectedExtent = Math.max(0, normalizedExtent * userBand);

  const projectedLow = user.anchors.mid - projectedExtent / 2;
  const projectedHigh = user.anchors.mid + projectedExtent / 2;

  const gateLow = user.absoluteLow - STRETCH_CENTS;
  const gateHigh = user.absoluteHigh + STRETCH_CENTS;
  const gateSpan = Math.max(0, gateHigh - gateLow);

  const passes = projectedLow >= gateLow && projectedHigh <= gateHigh;
  const usage = gateSpan > 0 ? projectedExtent / gateSpan : 1;
  const fitScore = passes
    ? usage <= COMFORT_USAGE
      ? 1
      : Math.max(0, 1 - (usage - COMFORT_USAGE) / (1 - COMFORT_USAGE))
    : 0;

  return { passes, projectedLow, projectedHigh, projectedExtent, usage, fitScore };
}

function l1(a: number[], b: number[]): number {
  let sum = 0;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return sum;
}

/** Scale-free similarity for non-negative rate-like quantities: 0 if either
 * is zero and the other isn't, 1 if both are zero, else min/max ratio. */
function ratioSim(a: number, b: number): number {
  if (a <= 0 && b <= 0) return 1;
  const mx = Math.max(a, b);
  return mx <= 0 ? 1 : Math.min(a, b) / mx;
}

export interface StyleScore {
  score: number;
  histSim: number;
  movementSim: number;
  pauseSim: number;
  voicedSim: number;
}

const W_HIST = 0.5;
const W_MOVEMENT = 0.2;
const W_PAUSE = 0.15;
const W_VOICED = 0.15;

export function computeStyleScore(reciter: StyleVector, user: StyleVector): StyleScore {
  // Interval histograms both sum to 1, so L1 distance is in [0, 2].
  const histSim = 1 - l1(reciter.intervalHist, user.intervalHist) / 2;
  const movementSim = ratioSim(reciter.movement, user.movement);
  const pauseSim = ratioSim(reciter.pauseStats.ratePerSec, user.pauseStats.ratePerSec);
  const voicedSim = 1 - Math.abs(reciter.voicedRatio - user.voicedRatio);
  const score =
    W_HIST * histSim + W_MOVEMENT * movementSim + W_PAUSE * pauseSim + W_VOICED * voicedSim;
  return { score, histSim, movementSim, pauseSim, voicedSim };
}

export interface RankedReciter {
  reciterId: string;
  rangeFit: RangeFit;
  styleScore: StyleScore;
  /** blend·rangeFit + (1-blend)·style. Only meaningful when rangeFit.passes. */
  overall: number;
}

/** blend: 0 = style only, 1 = range comfort only (slider default 0.5). */
export function rankReciters(
  features: ReciterFeatures[],
  user: VoiceProfile,
  userStyle: StyleVector,
  blend: number,
): RankedReciter[] {
  const scored = features.map((f) => {
    const rangeFit = computeRangeFit(f, user);
    const styleScore = computeStyleScore(f.style, userStyle);
    const overall = blend * rangeFit.fitScore + (1 - blend) * styleScore.score;
    return { reciterId: f.reciterId, rangeFit, styleScore, overall };
  });

  // Hard gate: failers never rank above passers, regardless of style score.
  const passers = scored.filter((s) => s.rangeFit.passes).sort((a, b) => b.overall - a.overall);
  const failers = scored
    .filter((s) => !s.rangeFit.passes)
    .sort((a, b) => b.styleScore.score - a.styleScore.score);
  return [...passers, ...failers];
}

/** Plain-language one-liner for a result card. */
export function explain(
  r: RankedReciter,
  reciterStyle: StyleVector,
  userStyle: StyleVector,
): string {
  const parts: string[] = [];

  if (r.rangeFit.passes) {
    parts.push(
      r.rangeFit.fitScore > 0.7
        ? "his melody lives comfortably inside your range"
        : "his melody fits your range, but reaches toward its edges",
    );
  } else {
    parts.push("his melody stretches outside your comfortable range");
  }

  // Mention whichever of movement / pausing differs more, in log-ratio terms
  // so "half as busy" and "twice as busy" read as equally notable.
  const movementRatio =
    reciterStyle.movement / Math.max(userStyle.movement, 1e-6);
  const pauseRatio =
    reciterStyle.pauseStats.ratePerSec / Math.max(userStyle.pauseStats.ratePerSec, 1e-6);
  const movementGap = Math.abs(Math.log(Math.max(movementRatio, 1e-6)));
  const pauseGap = Math.abs(Math.log(Math.max(pauseRatio, 1e-6)));

  if (movementGap >= pauseGap) {
    if (movementRatio > 1.25) parts.push("his movement is busier than yours");
    else if (movementRatio < 0.8) parts.push("his movement is calmer than yours");
    else parts.push("his movement pace is close to yours");
  } else {
    if (pauseRatio > 1.25) parts.push("he pauses more often than you do");
    else if (pauseRatio < 0.8) parts.push("he pauses less often than you do");
    else parts.push("his pausing rhythm is close to yours");
  }

  return `${parts.join("; ")}.`;
}
