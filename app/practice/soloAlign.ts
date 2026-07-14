/**
 * Solo-mode take review (spec §5.4, §7.4): align a recorded take (no
 * reference played back) to the reference contour with DTW, then derive the
 * overlay lines, headline stats, and per-word chip stats. Pure functions,
 * no React — the caller (SoloPractice) computes this once per stopped take
 * and memoises the result for SoloReview.
 */
import type { Contour } from "@/lib/contour/extract";
import { mapReciterToUser, type Anchors } from "@/lib/pitch/cents";
import { dtw, bridgeGaps, refToUserMap } from "@/lib/dtw/dtw";
import type { WordTiming } from "@/lib/segments/types";

/** One mic reading, timestamped relative to the recording's own start (ms). */
export interface PitchSample {
  tMs: number;
  cents: number | null;
}

export type WordChipColor = "green" | "amber" | "red";

export interface WordReview {
  word: WordTiming;
  /** Mean |user − target| in cents over this word's voiced ref frames, post-alignment. Null if no voiced frames. */
  meanAbsErrorCents: number | null;
  /** Signed mean error (user − target); negative = user sang flat, positive = sharp. */
  meanSignedErrorCents: number | null;
  /** user duration / ref duration for this word, via the DTW ref→user map. */
  durationRatio: number | null;
  /** Fraction of 100ms steps within the word where user and target moved the same way. Null if too short to measure. */
  directionAgreement: number | null;
  color: WordChipColor;
  /** Word boundaries mapped into the *recording's* own clock (seconds since take start) — for seeking the take audio. */
  userStartSec: number;
  userEndSec: number;
}

export interface SoloReviewResult {
  /** Reference frame times (seconds), x-axis for the overlay. */
  refTimes: number[];
  /** Reciter contour projected into the user's range, one per ref frame (null where the reciter was unvoiced there). */
  refProjected: (number | null)[];
  /** User's own cents at the ref-mapped frame, one per ref frame — null where the *original* user frame was unvoiced. */
  greenLine: (number | null)[];
  within60Pct: number;
  within150Pct: number;
  directionAgreementPct: number;
  normalizedDistance: number;
  closenessPhrase: string;
  words: WordReview[] | null;
}

export type SoloReviewOutcome = { ok: true; review: SoloReviewResult } | { ok: false; message: string };

const NOT_ENOUGH_USER_VOICE =
  "We didn't catch enough voiced audio in that take — try again a little closer to the mic.";
const NOT_ENOUGH_REF_VOICE =
  "This reference clip doesn't have enough voiced signal to compare against — try a different ayah.";

/** Frame index in `contour` nearest to `tSec`, clamped to range. */
function frameIndexAt(contour: Contour, tSec: number): number {
  if (contour.times.length === 0) return 0;
  const idx = Math.round((tSec - contour.times[0]) / contour.hopSec);
  return Math.min(Math.max(idx, 0), contour.times.length - 1);
}

/** Classify a delta into level / rising / falling for direction-agreement comparisons. */
function classifyDelta(d: number): -1 | 0 | 1 {
  if (Math.abs(d) < 20) return 0;
  return d > 0 ? 1 : -1;
}

function phraseForDistance(d: number): string {
  if (!Number.isFinite(d)) return "we couldn't measure a melodic match this time";
  if (d <= 40) return "a very close melodic match";
  if (d <= 80) return "a good melodic match, with some drift";
  if (d <= 150) return "the shape is there, but drifting in places";
  return "quite different from the reciter's melody this time — worth another pass";
}

function colorForWord(meanAbsErrorCents: number | null, durationRatio: number | null): WordChipColor {
  if (meanAbsErrorCents === null) return "amber";
  if (meanAbsErrorCents > 150) return "red";
  if (meanAbsErrorCents <= 60 && durationRatio !== null && durationRatio >= 0.7 && durationRatio <= 1.4) {
    return "green";
  }
  return "amber";
}

/** Kind, wordy phrasing for the popover — never a raw number. */
export function wordPitchPhrase(meanAbs: number | null, meanSigned: number | null): string {
  if (meanAbs === null) return "not enough voiced sound here to judge pitch";
  if (meanAbs <= 60) return "right on the note";
  const dir = (meanSigned ?? 0) < 0 ? "flat" : "sharp";
  if (meanAbs <= 150) return `a touch ${dir}`;
  return `notably ${dir}`;
}

export function wordPacePhrase(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return "pace unclear";
  if (ratio < 0.7) return "slightly rushed";
  if (ratio > 1.4) return "slightly dragged";
  return "good pacing";
}

function buildWordReview(
  w: WordTiming,
  refContour: Contour,
  refBridged: number[],
  userBridged: number[],
  userMap: number[],
): WordReview {
  const hopSec = refContour.hopSec;
  const startFrame = frameIndexAt(refContour, w.startSec);
  const endFrameRaw = frameIndexAt(refContour, w.endSec);
  const endFrame = Math.max(startFrame + 1, endFrameRaw);
  const step = Math.max(1, Math.round(0.1 / hopSec));

  let sumAbsErr = 0;
  let sumSignedErr = 0;
  let count = 0;
  let dirDenom = 0;
  let dirAgree = 0;

  for (let j = startFrame; j < endFrame; j++) {
    if (refContour.cents[j] === null) continue;
    const target = refBridged[j];
    const userVal = userBridged[userMap[j]];
    sumAbsErr += Math.abs(userVal - target);
    sumSignedErr += userVal - target;
    count++;

    const j2 = j + step;
    if (j2 < endFrame && refContour.cents[j2] !== null) {
      const targetDelta = refBridged[j2] - refBridged[j];
      const userDelta = userBridged[userMap[j2]] - userBridged[userMap[j]];
      dirDenom++;
      if (classifyDelta(targetDelta) === classifyDelta(userDelta)) dirAgree++;
    }
  }

  const meanAbsErrorCents = count > 0 ? sumAbsErr / count : null;
  const meanSignedErrorCents = count > 0 ? sumSignedErr / count : null;
  const directionAgreement = dirDenom > 0 ? dirAgree / dirDenom : null;

  const userFrameStart = userMap[startFrame] ?? 0;
  const userFrameEnd = userMap[Math.min(endFrameRaw, refContour.times.length - 1)] ?? userFrameStart;
  const refDurationSec = Math.max(1e-6, w.endSec - w.startSec);
  const userDurationSec = Math.max(0, userFrameEnd - userFrameStart) * hopSec;
  const durationRatio = userDurationSec / refDurationSec;

  return {
    word: w,
    meanAbsErrorCents,
    meanSignedErrorCents,
    durationRatio: Number.isFinite(durationRatio) ? durationRatio : null,
    directionAgreement,
    color: colorForWord(meanAbsErrorCents, Number.isFinite(durationRatio) ? durationRatio : null),
    userStartSec: Math.min(userFrameStart, userFrameEnd) * hopSec,
    userEndSec: Math.max(userFrameStart, userFrameEnd) * hopSec,
  };
}

/**
 * Build the full solo review: resample the recorded pitch timeline onto the
 * reference contour's hop grid, DTW-align it to the (range-projected)
 * reference contour, and derive overlay lines + headline stats + per-word
 * chips. Returns a kind error message instead of throwing when either side
 * has no voiced signal at all.
 */
export function buildSoloReview(
  pitchTimeline: PitchSample[],
  refContour: Contour,
  userAnchors: Anchors,
  words: WordTiming[] | null,
): SoloReviewOutcome {
  if (pitchTimeline.length === 0) return { ok: false, message: NOT_ENOUGH_USER_VOICE };

  const hopSec = refContour.hopSec;
  const lastTMs = pitchTimeline[pitchTimeline.length - 1].tMs;
  const numUserFrames = Math.max(1, Math.round(lastTMs / 1000 / hopSec) + 1);

  // Resample the recorded timeline onto the reference hop grid: for each
  // k*hopSec, the nearest reading by time (two-pointer scan — both sequences
  // are time-sorted so this stays linear).
  const userSeqRaw: (number | null)[] = new Array(numUserFrames).fill(null);
  let p = 0;
  for (let k = 0; k < numUserFrames; k++) {
    const targetMs = k * hopSec * 1000;
    while (
      p < pitchTimeline.length - 1 &&
      Math.abs(pitchTimeline[p + 1].tMs - targetMs) <= Math.abs(pitchTimeline[p].tMs - targetMs)
    ) {
      p++;
    }
    userSeqRaw[k] = pitchTimeline[p].cents;
  }

  const refSeqRaw: (number | null)[] = refContour.cents.map((c) =>
    c === null ? null : mapReciterToUser(c, refContour.anchors, userAnchors),
  );

  const userBridged = bridgeGaps(userSeqRaw);
  const refBridged = bridgeGaps(refSeqRaw);
  if (!userBridged) return { ok: false, message: NOT_ENOUGH_USER_VOICE };
  if (!refBridged) return { ok: false, message: NOT_ENOUGH_REF_VOICE };

  const { path, normalizedDistance } = dtw(userBridged, refBridged, 0.2);
  const userMap = refToUserMap(path, refBridged.length);

  // Green line: user's *raw* (unbridged) cents at the mapped user frame,
  // drawn only where that original user frame was actually voiced.
  const greenLine: (number | null)[] = refContour.times.map((_, j) => userSeqRaw[userMap[j]] ?? null);

  // Headline stats over voiced ref frames.
  let denom = 0;
  let w60 = 0;
  let w150 = 0;
  const step = Math.max(1, Math.round(0.1 / hopSec));
  let dirDenom = 0;
  let dirAgree = 0;
  for (let j = 0; j < refContour.cents.length; j++) {
    if (refContour.cents[j] === null) continue;
    denom++;
    const target = refBridged[j];
    const userVal = userBridged[userMap[j]];
    const err = Math.abs(userVal - target);
    if (err <= 150) w150++;
    if (err <= 60) w60++;

    const j2 = j + step;
    if (j2 < refContour.cents.length && refContour.cents[j2] !== null) {
      const targetDelta = refBridged[j2] - refBridged[j];
      const userDelta = userBridged[userMap[j2]] - userBridged[userMap[j]];
      dirDenom++;
      if (classifyDelta(targetDelta) === classifyDelta(userDelta)) dirAgree++;
    }
  }

  const within60Pct = denom > 0 ? Math.round((w60 / denom) * 100) : 0;
  const within150Pct = denom > 0 ? Math.round((w150 / denom) * 100) : 0;
  const directionAgreementPct = dirDenom > 0 ? Math.round((dirAgree / dirDenom) * 100) : 0;

  const wordReviews =
    words && words.length > 0
      ? words.map((w) => buildWordReview(w, refContour, refBridged, userBridged, userMap))
      : null;

  return {
    ok: true,
    review: {
      refTimes: refContour.times,
      refProjected: refSeqRaw,
      greenLine,
      within60Pct,
      within150Pct,
      directionAgreementPct,
      normalizedDistance,
      closenessPhrase: phraseForDistance(normalizedDistance),
      words: wordReviews,
    },
  };
}
