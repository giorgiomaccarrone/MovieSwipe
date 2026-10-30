import { NextRequest, NextResponse } from "next/server";
import { getDeck } from "@/lib/tmdb";
import type { TypeFilter } from "@/lib/types";

// GET /api/deck?p=8,119&t=all
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const providers = (sp.get("p") ?? "")
    .split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 8);
  const t = sp.get("t");
  const filter: TypeFilter = t === "movie" || t === "tv" ? t : "all";
  if (!providers.length) return NextResponse.json({ error: "Scegli almeno una piattaforma." }, { status: 400 });
  try {
    return NextResponse.json({ items: await getDeck(providers, filter) });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Impossibile caricare i titoli da TMDB." }, { status: 502 });
  }
}
