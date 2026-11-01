import "server-only";
import type { MediaType, Provider, Title, TypeFilter } from "./types";
import { demoDeck, demoDetails, demoProviders } from "./demo";
import { tmdbGenres } from "./genres";

const API = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p/";
const REGION = "IT";
const LANG = "it-IT";
const CACHE_SECONDS = 60 * 60 * 6; // il catalogo cambia lentamente: 6 ore di cache

const KEY = process.env.TMDB_API_KEY?.trim() || "";
export const isDemo = !KEY;

export const toKey = (type: MediaType, id: number) => (type === "movie" ? "m" : "t") + id.toString(36);
export const fromKey = (key: string): { type: MediaType; id: number } | null => {
  const m = /^([mt])([0-9a-z]+)$/.exec(key);
  if (!m) return null;
  const id = parseInt(m[2], 36);
  return Number.isFinite(id) && id > 0 ? { type: m[1] === "m" ? "movie" : "tv", id } : null;
};

/** Accetta sia la "API Key" v3 sia il "Read Access Token" v4 (che inizia con eyJ). */
async function tmdb<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(API + path);
  const headers: Record<string, string> = { accept: "application/json" };
  if (KEY.startsWith("eyJ")) headers.authorization = `Bearer ${KEY}`;
  else url.searchParams.set("api_key", KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers, next: { revalidate: CACHE_SECONDS } });
  if (!res.ok) throw new Error(`TMDB ${res.status} su ${path}`);
  return res.json() as Promise<T>;
}

/* ---------- Generi (id → nome) ---------- */
type GenreList = { genres: { id: number; name: string }[] };
async function genreMap(): Promise<Map<number, string>> {
  const [m, t] = await Promise.all([
    tmdb<GenreList>("/genre/movie/list", { language: LANG }),
    tmdb<GenreList>("/genre/tv/list", { language: LANG }),
  ]);
  return new Map([...m.genres, ...t.genres].map((g) => [g.id, g.name]));
}

/* ---------- Piattaforme disponibili in Italia ---------- */
type ProviderList = {
  results: { provider_id: number; provider_name: string; logo_path: string | null; display_priorities?: Record<string, number>; display_priority?: number }[];
};
// Piattaforme "doppione" (canali dentro altri servizi, versioni con pubblicità) che confondono la scelta
const HIDE = /channel|with ads|amazon video|apple tv store|google play|rakuten|chili|timvision|microsoft|youtube/i;

export async function getProviders(): Promise<Provider[]> {
  if (isDemo) return demoProviders;
  const [m, t] = await Promise.all([
    tmdb<ProviderList>("/watch/providers/movie", { watch_region: REGION, language: LANG }),
    tmdb<ProviderList>("/watch/providers/tv", { watch_region: REGION, language: LANG }),
  ]);
  const byId = new Map<number, { p: Provider; prio: number }>();
  for (const r of [...m.results, ...t.results]) {
    if (HIDE.test(r.provider_name) || byId.has(r.provider_id)) continue;
    byId.set(r.provider_id, {
      p: { id: r.provider_id, name: r.provider_name, logo: r.logo_path ? IMG + "w92" + r.logo_path : null },
      prio: r.display_priorities?.[REGION] ?? r.display_priority ?? 999,
    });
  }
  return [...byId.values()].sort((a, b) => a.prio - b.prio).slice(0, 12).map((x) => x.p);
}

/* ---------- Mazzo: i titoli più popolari sulle piattaforme scelte ---------- */
type Discover = {
  results: {
    id: number; title?: string; name?: string; release_date?: string; first_air_date?: string;
    overview: string; poster_path: string | null; vote_average: number; genre_ids: number[]; popularity: number;
  }[];
};
const PAGES = 2; // 20 titoli a pagina, per piattaforma e per tipo
const MAX_DECK = 80;

/** `window` = quale blocco di pagine di TMDB usare (0 = le prime 2, 1 = la 3 e la 4…): serve per i "nuovi giri" */
export async function getDeck(providerIds: number[], filter: TypeFilter, genreIds: string[] = [], window = 0): Promise<Title[]> {
  if (isDemo) return window === 0 ? demoDeck(providerIds, filter, genreIds) : [];
  const [genres, providers] = await Promise.all([genreMap(), getProviders()]);
  const provName = new Map(providers.map((p) => [p.id, p.name]));
  // Salto i tipi per cui nessuno dei generi scelti esiste (es. "Horror" tra le serie)
  const types = (filter === "all" ? ["movie", "tv"] as MediaType[] : [filter])
    .map((type) => ({ type, g: tmdbGenres(genreIds, type) }))
    .filter((x) => x.g === null || x.g.length > 0);

  // Una ricerca per piattaforma: così sappiamo su quale servizio si trova ogni titolo
  const jobs = providerIds.flatMap((pid) =>
    types.flatMap(({ type, g }) =>
      Array.from({ length: PAGES }, (_, i) =>
        tmdb<Discover>(`/discover/${type}`, {
          language: LANG, watch_region: REGION, with_watch_providers: pid,
          with_watch_monetization_types: "flatrate", sort_by: "popularity.desc",
          "vote_count.gte": 50, include_adult: "false", page: window * PAGES + i + 1,
          ...(g ? { with_genres: g.join("|") } : {}), // "|" = basta uno dei generi
        }).then((d) => ({ pid, type, d }), () => null),
      ),
    ),
  );
  const pages = (await Promise.all(jobs)).filter((x) => x !== null);

  const all = new Map<string, Title & { pop: number }>();
  for (const { pid, type, d } of pages) {
    for (const r of d.results) {
      const key = toKey(type, r.id);
      const name = provName.get(pid) ?? "";
      const existing = all.get(key);
      if (existing) { if (name && !existing.providers.includes(name)) existing.providers.push(name); continue; }
      const date = r.release_date || r.first_air_date || "";
      all.set(key, {
        key, type, title: r.title || r.name || "Senza titolo",
        year: date ? Number(date.slice(0, 4)) : null,
        overview: r.overview || "",
        poster: r.poster_path ? IMG + "w500" + r.poster_path : null,
        rating: r.vote_average ? Math.round(r.vote_average * 10) / 10 : null,
        genres: r.genre_ids.map((g) => genres.get(g)).filter((g): g is string => !!g).slice(0, 3),
        providers: name ? [name] : [],
        pop: r.popularity,
      });
    }
  }
  return [...all.values()]
    .sort((a, b) => b.pop - a.pop)
    .slice(0, MAX_DECK)
    .map(({ pop: _pop, ...t }) => t);
}

/* ---------- Dettagli di titoli specifici (per mostrare i match) ---------- */
type Detail = {
  id: number; title?: string; name?: string; release_date?: string; first_air_date?: string;
  overview: string; poster_path: string | null; vote_average: number; genres: { name: string }[];
  "watch/providers"?: { results?: Record<string, { flatrate?: { provider_name: string }[] }> };
};

export async function getDetails(keys: string[]): Promise<Title[]> {
  if (isDemo) return demoDetails(keys);
  const parsed = keys.map(fromKey).filter((k) => k !== null).slice(0, 60);
  const out = await Promise.all(
    parsed.map(({ type, id }) =>
      tmdb<Detail>(`/${type}/${id}`, { language: LANG, append_to_response: "watch/providers" }).then(
        (r): Title => {
          const date = r.release_date || r.first_air_date || "";
          return {
            key: toKey(type, id), type, title: r.title || r.name || "Senza titolo",
            year: date ? Number(date.slice(0, 4)) : null,
            overview: r.overview || "",
            poster: r.poster_path ? IMG + "w500" + r.poster_path : null,
            rating: r.vote_average ? Math.round(r.vote_average * 10) / 10 : null,
            genres: r.genres.map((g) => g.name).slice(0, 3),
            providers: (r["watch/providers"]?.results?.[REGION]?.flatrate ?? []).map((p) => p.provider_name),
          };
        },
        () => null,
      ),
    ),
  );
  return out.filter((t): t is Title => t !== null);
}
