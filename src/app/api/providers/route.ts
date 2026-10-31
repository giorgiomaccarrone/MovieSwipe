import { NextResponse } from "next/server";
import { getProviders, isDemo } from "@/lib/tmdb";
import { hasDatabase } from "@/lib/kv";

export async function GET() {
  try {
    return NextResponse.json({ demo: isDemo, database: hasDatabase, providers: await getProviders() });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Impossibile caricare le piattaforme da TMDB." }, { status: 502 });
  }
}
