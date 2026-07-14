/**
 * Rough note naming for display only (not used in any pitch maths). Converts
 * a cents value (relative to F_REF = 110 Hz = A2, see @/lib/pitch/cents) to
 * the nearest equal-tempered note name, e.g. "A2", "D#3".
 */

const NOTE_NAMES = [
  "A",
  "A#",
  "B",
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
];

const REF_OCTAVE = 2; // F_REF (110 Hz) is A2

export function centsToNoteName(cents: number): string {
  if (!Number.isFinite(cents)) return "—";
  const semitones = Math.round(cents / 100);
  const octaveOffset = Math.floor(semitones / 12);
  const noteIndex = semitones - octaveOffset * 12; // always 0..11
  const octave = REF_OCTAVE + octaveOffset;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}
