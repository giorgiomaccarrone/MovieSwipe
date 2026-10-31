import { body, codeFrom, handle } from "@/lib/http";
import { RoomError, isMember, renameRoom } from "@/lib/rooms";

// POST { member, name } — nome vuoto = stanza senza nome
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = await codeFrom(params);
    const b = await body(req);
    if (typeof b.member !== "string" || !isMember(b.member)) throw new RoomError("Richiesta non valida.");
    return renameRoom(code, b.member, String(b.name ?? ""));
  });
}
