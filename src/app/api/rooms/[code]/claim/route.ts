import { body, codeFrom, handle } from "@/lib/http";
import { claimMember } from "@/lib/rooms";

// POST { name } — "Sono io": riprendi il tuo posto nella stanza da un altro telefono
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(async () => {
    const code = await codeFrom(params);
    const b = await body(req);
    return claimMember(code, String(b.name ?? ""));
  });
}
