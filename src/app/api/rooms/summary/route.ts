import { NextRequest } from "next/server";
import { handle } from "@/lib/http";
import { isCode, summaries } from "@/lib/rooms";

// GET ?codes=K7QM,AB2C — riepilogo delle stanze salvate sul telefono
export async function GET(req: NextRequest) {
  return handle(async () => {
    const codes = (req.nextUrl.searchParams.get("codes") ?? "").toUpperCase().split(",").filter(isCode);
    return summaries([...new Set(codes)]);
  });
}
