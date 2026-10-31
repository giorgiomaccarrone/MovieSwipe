import { body, handle } from "@/lib/http";
import { RoomError, createRoom } from "@/lib/rooms";
import type { TypeFilter } from "@/lib/types";
import { cleanGenres } from "@/lib/genres";

// POST /api/rooms  { name, providers: number[], filter, genres?: string[], roomName?: string }
export async function POST(req: Request) {
  return handle(async () => {
    const b = await body(req);
    const providers = (Array.isArray(b.providers) ? b.providers : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 8);
    const filter: TypeFilter = b.filter === "movie" || b.filter === "tv" ? b.filter : "all";
    if (!providers.length) throw new RoomError("Scegli almeno una piattaforma.");
    return createRoom(String(b.name ?? ""), providers, filter, cleanGenres(b.genres), String(b.roomName ?? ""));
  });
}
