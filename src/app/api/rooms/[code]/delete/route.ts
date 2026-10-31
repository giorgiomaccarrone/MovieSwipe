import { body, codeFrom, handle } from "@/lib/http";
import { RoomError, deleteRoom, isMember } from "@/lib/rooms";

// POST { member } — elimina la stanza per tutti (irreversibile)
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = await codeFrom(params);
    const b = await body(req);
    if (typeof b.member !== "string" || !isMember(b.member)) throw new RoomError("Richiesta non valida.");
    await deleteRoom(code, b.member);
  });
}
