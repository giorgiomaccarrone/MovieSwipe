import { NextResponse } from "next/server";
import { getProviders, isDemo } from "@/lib/tmdb";

export async function GET() {
  try {
    return NextResponse.json({ demo: isDemo, providers: await getProviders() });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Impossibile caricare le piattaforme da TMDB." }, { status: 502 });
  }
}
