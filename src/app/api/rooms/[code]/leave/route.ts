import { body, codeFrom, handle } from "@/lib/http";
import { RoomError, isMember, leave } from "@/lib/rooms";

// POST { member }
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = await codeFrom(params);
    const b = await body(req);
    if (typeof b.member !== "string" || !isMember(b.member)) throw new RoomError("Richiesta non valida.");
    await leave(code, b.member);
  });
}
