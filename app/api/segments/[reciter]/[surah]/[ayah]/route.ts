import { NextRequest, NextResponse } from "next/server";
import { RECITERS, qaudioUrl } from "@/data/surahs";
import { buildAyahWords } from "@/lib/segments/server";
import type { AyahWords } from "@/lib/segments/types";

/**
 * Word-level timing for one ayah, normalised from the Quran.com v4 API (see
 * lib/segments/server.ts for the segment-format research notes). Returns a
 * clean 404 when this reciter/ayah has no usable word timing so the client
 * can fall back to the whole-ayah EveryAyah path without a regression.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ reciter: string; surah: string; ayah: string }> },
) {
  const { reciter, surah, ayah } = await ctx.params;

  if (!RECITERS.some((r) => r.id === reciter)) {
    return NextResponse.json({ error: "unknown reciter" }, { status: 404 });
  }
  const s = Number(surah);
  const a = Number(ayah);
  if (!Number.isInteger(s) || !Number.isInteger(a) || s < 1 || s > 114 || a < 1 || a > 286) {
    return NextResponse.json({ error: "bad ayah reference" }, { status: 400 });
  }

  const built = await buildAyahWords(reciter, s, a);
  if (!built) {
    return NextResponse.json(
      { error: "no word timing available for this reciter/ayah" },
      { status: 404 },
    );
  }

  const payload: AyahWords = {
    audioUrl: qaudioUrl(reciter, s, a),
    words: built.words,
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
