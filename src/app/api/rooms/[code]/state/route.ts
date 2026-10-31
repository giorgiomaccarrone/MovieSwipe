import { NextRequest } from "next/server";
import { codeFrom, handle } from "@/lib/http";
import { roomState } from "@/lib/rooms";

// GET ?v=12 — se non è cambiato nulla risponde { same: true } (una sola lettura sul database)
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  return handle(async () => roomState(await codeFrom(params), Number(req.nextUrl.searchParams.get("v")) || undefined));
}
