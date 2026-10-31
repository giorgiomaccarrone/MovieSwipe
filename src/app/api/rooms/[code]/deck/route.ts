import { codeFrom, handle } from "@/lib/http";
import { roomDeck } from "@/lib/rooms";

// GET — mazzo e impostazioni aggiornati (dopo un nuovo giro)
export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  return handle(async () => roomDeck(await codeFrom(params)));
}
