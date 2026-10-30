import { NextRequest, NextResponse } from "next/server";
import { getDetails } from "@/lib/tmdb";

// GET /api/details?k=m2bq,t1x9
export async function GET(req: NextRequest) {
  const keys = (req.nextUrl.searchParams.get("k") ?? "")
    .split(",").filter((k) => /^[mt][0-9a-z]{1,10}$/.test(k)).slice(0, 60);
  try {
    return NextResponse.json({ items: keys.length ? await getDetails(keys) : [] });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Impossibile caricare i dettagli da TMDB." }, { status: 502 });
  }
}
