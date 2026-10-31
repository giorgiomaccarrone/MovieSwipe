import { body, codeFrom, handle } from "@/lib/http";
import { isMember, joinRoom } from "@/lib/rooms";

// POST { name, member? }  — con member valido rientra nella stanza
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = await codeFrom(params);
    const b = await body(req);
    const member = typeof b.member === "string" && isMember(b.member) ? b.member : undefined;
    return joinRoom(code, String(b.name ?? ""), member);
  });
}
