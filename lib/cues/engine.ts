/**
 * The cue engine — guidance, never grading (spec §5.3).
 * Turns pitch error vs the projected target into at most one short, kind cue.
 * Thresholds widen with the user's calibrated wobble so a naturally unsteady
 * voice is not nagged.
 */

export type CueId =
  | "good"
  | "touch-low"
  | "touch-high"
  | "too-low"
  | "too-high"
  | "follow-rise"
  | "ease-down"
  | null;

export const CUE_TEXT: Record<Exclude<CueId, null>, string> = {
  good: "good — hold it",
  "touch-low": "a touch low",
  "touch-high": "a touch high",
  "too-low": "too low",
  "too-high": "too high",
  "follow-rise": "follow the rise",
  "ease-down": "ease down",
};

export interface CueInput {
  /** ms timestamp of this reading */
  tMs: number;
  /** user pitch − projected target, in cents; null if either is unvoiced */
  errorCents: number | null;
  /** target slope over the next 0.5–1.0 s, cents/sec; null if unknown */
  targetSlopeAhead: number | null;
}

const SUSTAIN_MS = 300;
const SLOPE_THRESHOLD = 400; // cents/sec of upcoming target movement
const MIN_CUE_HOLD_MS = 700; // don't flicker between cues

export class CueEngine {
  private onLineSince: number | null = null;
  private offLaneSince: number | null = null;
  private offLaneSign = 0;
  private current: CueId = null;
  private currentSince = 0;
  private inner: number;
  private outer: number;

  /** wobble: std-dev in cents from calibration; widens the bands. */
  constructor(wobble: number = 0) {
    const w = Math.min(Math.max(wobble, 0), 60);
    this.inner = 60 + w * 0.5;
    this.outer = 150 + w * 0.5;
  }

  update(input: CueInput): CueId {
    const { tMs, errorCents, targetSlopeAhead } = input;
    let next: CueId = this.current;

    // Lookahead cues take priority: warn before the contour moves.
    if (targetSlopeAhead !== null && Math.abs(targetSlopeAhead) > SLOPE_THRESHOLD) {
      next = targetSlopeAhead > 0 ? "follow-rise" : "ease-down";
      this.onLineSince = null;
      this.offLaneSince = null;
    } else if (errorCents === null) {
      // Unvoiced — keep whatever is showing; silence is not an error.
      this.onLineSince = null;
      this.offLaneSince = null;
    } else {
      const abs = Math.abs(errorCents);
      const sign = Math.sign(errorCents);

      if (abs <= this.inner) {
        this.offLaneSince = null;
        if (this.onLineSince === null) this.onLineSince = tMs;
        if (tMs - this.onLineSince >= SUSTAIN_MS) next = "good";
      } else if (abs <= this.outer) {
        this.onLineSince = null;
        this.offLaneSince = null;
        next = sign < 0 ? "touch-low" : "touch-high";
      } else {
        this.onLineSince = null;
        if (this.offLaneSince === null || this.offLaneSign !== sign) {
          this.offLaneSince = tMs;
          this.offLaneSign = sign;
        }
        if (tMs - this.offLaneSince >= SUSTAIN_MS) {
          next = sign < 0 ? "too-low" : "too-high";
        }
      }
    }

    // At most one cue on screen; hold it long enough to be readable.
    if (next !== this.current && tMs - this.currentSince >= MIN_CUE_HOLD_MS) {
      this.current = next;
      this.currentSince = tMs;
    }
    return this.current;
  }

  reset(): void {
    this.onLineSince = null;
    this.offLaneSince = null;
    this.current = null;
    this.currentSince = 0;
  }
}
