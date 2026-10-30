import type { TypeFilter } from "./types";

/**
 * Codice condiviso, senza database. Formato (tutto URL-safe):
 *   <piattaforme>-<tipo>.<Nome>.<like>.<Nome>.<like>...
 *   es.  8_119-a.Giorgio.m2bq_t1x9.Sara.m2bq
 * piattaforme = ID TMDB separati da "_"; tipo = a (tutto) | m (film) | t (serie);
 * like = chiavi dei titoli separate da "_", oppure "x" se nessun like.
 */
export interface Person { name: string; likes: string[] }
export interface Shared { providers: number[]; filter: TypeFilter; people: Person[] }

const T2C: Record<TypeFilter, string> = { all: "a", movie: "m", tv: "t" };
const C2T: Record<string, TypeFilter> = { a: "all", m: "movie", t: "tv" };

export const cleanName = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]/g, "").slice(0, 16);

export function encode(s: Shared): string {
  const head = `${s.providers.join("_")}-${T2C[s.filter]}`;
  return [head, ...s.people.flatMap((p) => [p.name, p.likes.length ? p.likes.join("_") : "x"])].join(".");
}

export function decode(text: string): Shared | null {
  const m = /(\d+(?:_\d+)*-[amt](?:\.[A-Za-z0-9]+\.[a-z0-9_]+)+)/.exec(String(text || ""));
  if (!m) return null;
  const parts = m[1].split(".");
  const [provs, t] = parts[0].split("-");
  const providers = provs.split("_").map(Number).filter((n) => n > 0);
  if (!providers.length || !C2T[t]) return null;
  const people: Person[] = [];
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const name = cleanName(parts[i]);
    if (!name) return null;
    const likes = parts[i + 1] === "x" ? [] : parts[i + 1].split("_").filter((k) => /^[mt][0-9a-z]+$/.test(k));
    people.push({ name, likes });
  }
  return people.length ? { providers, filter: C2T[t], people } : null;
}
