import "server-only";
import { NextResponse } from "next/server";
import { RoomError, isCode } from "./rooms";

/** Esegue il gestore e converte gli errori in risposte JSON leggibili */
export async function handle(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json((await fn()) ?? { ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof RoomError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Qualcosa è andato storto, riprova." }, { status: 500 });
  }
}

export async function codeFrom(params: Promise<{ code: string }>) {
  const code = (await params).code.toUpperCase();
  if (!isCode(code)) throw new RoomError("Codice stanza non valido.", 404);
  return code;
}

export async function body(req: Request): Promise<Record<string, unknown>> {
  try { return (await req.json()) as Record<string, unknown>; } catch { throw new RoomError("Richiesta non valida."); }
}
