import { body, codeFrom, handle } from "@/lib/http";
import { RoomError, isMember, newRound } from "@/lib/rooms";
import { cleanGenres } from "@/lib/genres";
import type { TypeFilter } from "@/lib/types";

// POST { member, providers, filter, genres } — aggiunge titoli nuovi al mazzo della stanza
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = await codeFrom(params);
    const b = await body(req);
    if (typeof b.member !== "string" || !isMember(b.member)) throw new RoomError("Richiesta non valida.");
    const providers = (Array.isArray(b.providers) ? b.providers : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 8);
    if (!providers.length) throw new RoomError("Scegli almeno una piattaforma.");
    const filter: TypeFilter = b.filter === "movie" || b.filter === "tv" ? b.filter : "all";
    return newRound(code, b.member, providers, filter, cleanGenres(b.genres));
  });
}
