import { NextRequest, NextResponse } from "next/server";
import { RECITERS } from "@/data/surahs";
import { ALLOWED_AUDIO_HOSTS, resolveAyahAudioUrl } from "@/lib/segments/server";

/**
 * Same-origin proxy for a reciter's Quran.com audio file — the exact file
 * word-level segment timestamps from /api/segments were measured against.
 * Must NOT be swapped for the EveryAyah proxy: timestamps only match the
 * file they were made for (see docs/TECHNICAL_SPECIFICATION.md §5, and the
 * "critical design constraint" this route exists to satisfy).
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

  const upstreamUrl = await resolveAyahAudioUrl(reciter, s, a);
  if (!upstreamUrl) {
    return NextResponse.json({ error: "no audio available" }, { status: 404 });
  }

  let host: string;
  try {
    host = new URL(upstreamUrl).hostname;
  } catch {
    return NextResponse.json({ error: "bad upstream url" }, { status: 502 });
  }
  if (!ALLOWED_AUDIO_HOSTS.has(host)) {
    return NextResponse.json({ error: "upstream host not allowlisted" }, { status: 502 });
  }

  const res = await fetch(upstreamUrl, { cache: "force-cache" });
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
      "X-Audio-Source": host,
    },
  });
}
