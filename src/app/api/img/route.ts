import { NextRequest } from "next/server";

// GET /api/img?p=/abc.jpg — copia della locandina piccola di TMDB servita dal nostro dominio,
// così il browser può leggerne i colori (per colorare la barra di stato di iPhone).
// La risposta viene messa in cache per un anno: TMDB non cambia mai un'immagine a parità di nome.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams.get("p") ?? "";
  if (!/^\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(p)) return new Response("Bad request", { status: 400 });
  const r = await fetch(`https://image.tmdb.org/t/p/w92${p}`);
  if (!r.ok) return new Response("Not found", { status: 404 });
  return new Response(await r.arrayBuffer(), {
    headers: {
      "content-type": r.headers.get("content-type") ?? "image/jpeg",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
