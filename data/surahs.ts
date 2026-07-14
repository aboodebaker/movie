/**
 * Static Phase-1 content: a small set of short surahs and reciters from
 * EveryAyah's per-ayah corpus. QUL text/segments replace this in Phase 3.
 */

export interface Reciter {
  /** EveryAyah folder name */
  id: string;
  name: string;
  /**
   * Quran.com v4 `recitations` resource id for the same reciter/style, used
   * to fetch word-level timing segments (see lib/segments/server.ts). Omit
   * when no matching recitation has verified word segments — the segments
   * API then 404s cleanly and the practice screen falls back to whole-ayah
   * highlighting from the EveryAyah clip.
   *
   * Verified 2026-07-14 against GET /api/v4/resources/recitations and
   * GET /api/v4/recitations/{id}/by_ayah/{s}:{a}?fields=segments (1:1, 1:2,
   * ..., 1:7, 112:1..4): all four ids below return segment counts matching
   * the verse's word count (or a sane multi-word merge, e.g. AbdulBasit's
   * 1:4 is one 3-word segment) for every test ayah.
   */
  quranComRecitationId?: number;
}

/** Verified against everyayah.com folder naming. */
export const RECITERS: Reciter[] = [
  { id: "Husary_128kbps", name: "Mahmoud Khalil Al-Husary", quranComRecitationId: 6 },
  { id: "Alafasy_128kbps", name: "Mishary Rashid Alafasy", quranComRecitationId: 7 },
  {
    id: "Abdul_Basit_Murattal_192kbps",
    name: "Abdul Basit (Murattal)",
    quranComRecitationId: 2,
  },
  {
    id: "Minshawy_Murattal_128kbps",
    name: "Mohamed Siddiq El-Minshawi",
    quranComRecitationId: 9,
  },
];

export interface Ayah {
  surah: number;
  ayah: number;
  arabic: string;
}

export interface Surah {
  number: number;
  name: string;
  arabicName: string;
  ayat: Ayah[];
}

export const SURAHS: Surah[] = [
  {
    number: 1,
    name: "Al-Fatihah",
    arabicName: "الفاتحة",
    ayat: [
      { surah: 1, ayah: 1, arabic: "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ" },
      { surah: 1, ayah: 2, arabic: "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ" },
      { surah: 1, ayah: 3, arabic: "ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ" },
      { surah: 1, ayah: 4, arabic: "مَـٰلِكِ يَوْمِ ٱلدِّينِ" },
      { surah: 1, ayah: 5, arabic: "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ" },
      { surah: 1, ayah: 6, arabic: "ٱهْدِنَا ٱلصِّرَٰطَ ٱلْمُسْتَقِيمَ" },
      {
        surah: 1,
        ayah: 7,
        arabic:
          "صِرَٰطَ ٱلَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ ٱلْمَغْضُوبِ عَلَيْهِمْ وَلَا ٱلضَّآلِّينَ",
      },
    ],
  },
  {
    number: 112,
    name: "Al-Ikhlas",
    arabicName: "الإخلاص",
    ayat: [
      { surah: 112, ayah: 1, arabic: "قُلْ هُوَ ٱللَّهُ أَحَدٌ" },
      { surah: 112, ayah: 2, arabic: "ٱللَّهُ ٱلصَّمَدُ" },
      { surah: 112, ayah: 3, arabic: "لَمْ يَلِدْ وَلَمْ يُولَدْ" },
      { surah: 112, ayah: 4, arabic: "وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌۢ" },
    ],
  },
];

/** Path to the same-origin audio proxy for one ayah clip. */
export function ayahAudioUrl(reciterId: string, surah: number, ayah: number): string {
  return `/api/audio/${encodeURIComponent(reciterId)}/${surah}/${ayah}`;
}

/** Path to the same-origin proxy for a reciter's Quran.com audio file (word-timed). */
export function qaudioUrl(reciterId: string, surah: number, ayah: number): string {
  return `/api/qaudio/${encodeURIComponent(reciterId)}/${surah}/${ayah}`;
}

/** Path to the same-origin word-segments API for one ayah. */
export function segmentsUrl(reciterId: string, surah: number, ayah: number): string {
  return `/api/segments/${encodeURIComponent(reciterId)}/${surah}/${ayah}`;
}

/** EveryAyah file stem: surah and ayah zero-padded to 3 digits, e.g. 001001. */
export function everyAyahFile(surah: number, ayah: number): string {
  return `${String(surah).padStart(3, "0")}${String(ayah).padStart(3, "0")}.mp3`;
}
