import { codeFrom, handle } from "@/lib/http";
import { roomInfo } from "@/lib/rooms";

// GET /api/rooms/K7QM → filtri e partecipanti, per la pagina di invito
export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(async () => roomInfo(await codeFrom(params)));
}
