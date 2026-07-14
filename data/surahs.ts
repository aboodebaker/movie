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

/**
 * Verified against everyayah.com folder naming — every folder below returned
 * HTTP 200 for 001001.mp3 on 2026-07-14. Reciters with a
 * quranComRecitationId get word-level highlighting; the rest fall back to
 * whole-ayah highlight. Word-timed reciters are listed first.
 */
export const RECITERS: Reciter[] = [
  // — word-level timing available (Quran.com segments) —
  { id: "Husary_128kbps", name: "Mahmoud Khalil Al-Husary", quranComRecitationId: 6 },
  { id: "Husary_Muallim_128kbps", name: "Al-Husary (Muallim, teaching pace)", quranComRecitationId: 12 },
  { id: "Alafasy_128kbps", name: "Mishary Rashid Alafasy", quranComRecitationId: 7 },
  { id: "Abdul_Basit_Murattal_192kbps", name: "Abdul Basit (Murattal)", quranComRecitationId: 2 },
  { id: "Abdul_Basit_Mujawwad_128kbps", name: "Abdul Basit (Mujawwad)", quranComRecitationId: 1 },
  { id: "Minshawy_Murattal_128kbps", name: "Al-Minshawi (Murattal)", quranComRecitationId: 9 },
  { id: "Minshawy_Mujawwad_192kbps", name: "Al-Minshawi (Mujawwad)", quranComRecitationId: 8 },
  { id: "Abdurrahmaan_As-Sudais_192kbps", name: "Abdur-Rahman As-Sudais", quranComRecitationId: 3 },
  { id: "Saood_ash-Shuraym_128kbps", name: "Saud Ash-Shuraym", quranComRecitationId: 10 },
  { id: "Abu_Bakr_Ash-Shaatree_128kbps", name: "Abu Bakr Ash-Shatri", quranComRecitationId: 4 },
  { id: "Hani_Rifai_192kbps", name: "Hani Ar-Rifai", quranComRecitationId: 5 },
  { id: "Mohammad_al_Tablaway_128kbps", name: "Mohamed Al-Tablawi", quranComRecitationId: 11 },
  // — whole-ayah highlight (no word segments yet) —
  { id: "Husary_128kbps_Mujawwad", name: "Al-Husary (Mujawwad)" },
  { id: "AbdulSamad_64kbps_QuranExplorer.Com", name: "Abdul Basit Abdus-Samad (legacy)" },
  { id: "Abdullaah_3awwaad_Al-Juhaynee_128kbps", name: "Abdullah Awad Al-Juhany" },
  { id: "Abdullah_Basfar_192kbps", name: "Abdullah Basfar" },
  { id: "Abdullah_Matroud_128kbps", name: "Abdullah Matroud" },
  { id: "ahmed_ibn_ali_al_ajamy_128kbps", name: "Ahmed ibn Ali Al-Ajmi" },
  { id: "Akram_AlAlaqimy_128kbps", name: "Akram Al-Alaqimi" },
  { id: "Ali_Hajjaj_AlSuesy_128kbps", name: "Ali Hajjaj Al-Suesy" },
  { id: "Ayman_Sowaid_64kbps", name: "Ayman Suwayd" },
  { id: "Fares_Abbad_64kbps", name: "Fares Abbad" },
  { id: "Ghamadi_40kbps", name: "Saad Al-Ghamdi" },
  { id: "Hudhaify_128kbps", name: "Ali Al-Hudhaify" },
  { id: "Khaalid_Abdullaah_al-Qahtaanee_192kbps", name: "Khalid Al-Qahtani" },
  { id: "khalefa_al_tunaiji_64kbps", name: "Khalifa Al-Tunaiji" },
  { id: "MaherAlMuaiqly128kbps", name: "Maher Al-Muaiqly" },
  { id: "Muhammad_AbdulKareem_128kbps", name: "Muhammad Abdul-Kareem" },
  { id: "Muhammad_Ayyoub_128kbps", name: "Muhammad Ayyub" },
  { id: "Muhammad_Jibreel_128kbps", name: "Muhammad Jibreel" },
  { id: "Muhsin_Al_Qasim_192kbps", name: "Muhsin Al-Qasim" },
  { id: "Mustafa_Ismail_48kbps", name: "Mustafa Ismail" },
  { id: "Nasser_Alqatami_128kbps", name: "Nasser Al-Qatami" },
  { id: "Sahl_Yassin_128kbps", name: "Sahl Yassin" },
  { id: "Salaah_AbdulRahman_Bukhatir_128kbps", name: "Salah Bukhatir" },
  { id: "Salah_Al_Budair_128kbps", name: "Salah Al-Budair" },
  { id: "Yaser_Salamah_128kbps", name: "Yaser Salamah" },
  { id: "Yasser_Ad-Dussary_128kbps", name: "Yasser Ad-Dussary" },
];

/**
 * Subset the Match screen analyses automatically (7 ayat are downloaded and
 * pitch-tracked per reciter on-device, so analysing all ~38 up front would
 * be minutes of downloads on a phone). Word-timed murattal reciters with
 * distinct voices/styles.
 */
export const MATCH_RECITERS: Reciter[] = RECITERS.filter((r) =>
  [
    "Husary_128kbps",
    "Alafasy_128kbps",
    "Abdul_Basit_Murattal_192kbps",
    "Minshawy_Murattal_128kbps",
    "Abdurrahmaan_As-Sudais_192kbps",
    "Saood_ash-Shuraym_128kbps",
    "Abu_Bakr_Ash-Shaatree_128kbps",
    "Hani_Rifai_192kbps",
    "MaherAlMuaiqly128kbps",
    "Ghamadi_40kbps",
  ].includes(r.id),
);

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
