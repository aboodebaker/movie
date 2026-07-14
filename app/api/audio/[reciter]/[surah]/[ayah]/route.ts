import { NextRequest, NextResponse } from "next/server";
import { RECITERS, everyAyahFile } from "@/data/surahs";

/**
 * Same-origin proxy for EveryAyah per-ayah MP3s. Needed because the browser
 * must decodeAudioData the clip (CORS) to extract the reference contour.
 * Allowlisted reciters only; responses are long-cached at the edge.
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

  const upstream = `https://everyayah.com/data/${reciter}/${everyAyahFile(s, a)}`;
  const res = await fetch(upstream, { cache: "force-cache" });
  if (!res.ok || !res.body) {
    return NextResponse.json(
      { error: `upstream ${res.status}` },
      { status: res.status === 404 ? 404 : 502 },
    );
  }

  return new NextResponse(res.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Audio-Source": "everyayah.com",
    },
  });
}
