import { body, codeFrom, handle } from "@/lib/http";
import { RoomError, isMember, isTitleKey, setWatched } from "@/lib/rooms";

// POST { member, key, watched: boolean }
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = await codeFrom(params);
    const b = await body(req);
    if (typeof b.member !== "string" || !isMember(b.member) || typeof b.key !== "string" || !isTitleKey(b.key)) throw new RoomError("Richiesta non valida.");
    await setWatched(code, b.member, b.key, b.watched !== false);
  });
}
