/**
 * Generi proposti all'utente. TMDB usa ID diversi per film e serie
 * (es. "Azione" film = 28, serie = 10759 "Action & Adventure"), quindi ogni genere
 * ha i suoi ID per i due tipi. Una lista vuota = per quel tipo il genere non esiste.
 * `demo` serve solo al catalogo di esempio, che ha i generi scritti a mano.
 */
export interface Genre { id: string; label: string; movie: number[]; tv: number[]; demo: RegExp }

export const GENRES: Genre[] = [
  { id: "azione",    label: "Azione e avventura",      movie: [28, 12],     tv: [10759],        demo: /azione|avventura|supereroi/i },
  { id: "commedia",  label: "Commedia",                movie: [35],         tv: [35],           demo: /commedia|comedy/i },
  { id: "dramma",    label: "Drammatico",              movie: [18],         tv: [18],           demo: /drammatico|drama/i },
  { id: "crimine",   label: "Crime e gialli",          movie: [80, 9648],   tv: [80, 9648],     demo: /giallo|gangster|crime|mistero/i },
  { id: "thriller",  label: "Thriller",                movie: [53],         tv: [9648],         demo: /thriller|spionaggio/i },
  { id: "horror",    label: "Horror",                  movie: [27],         tv: [],             demo: /horror/i },
  { id: "scifi",     label: "Fantascienza e fantasy",  movie: [878, 14],    tv: [10765],        demo: /fantascienza|fantasy/i },
  { id: "romantico", label: "Romantico",               movie: [10749],      tv: [],             demo: /romantico/i },
  { id: "animazione",label: "Animazione",              movie: [16],         tv: [16],           demo: /animazione/i },
  { id: "famiglia",  label: "Famiglia e bambini",      movie: [10751],      tv: [10751, 10762], demo: /famiglia|animazione/i },
  { id: "storia",    label: "Storia e guerra",         movie: [36, 10752],  tv: [10768],        demo: /storico|western/i },
  { id: "doc",       label: "Documentari",             movie: [99],         tv: [99],           demo: /documentario/i },
];

export const genreById = new Map(GENRES.map((g) => [g.id, g]));
export const cleanGenres = (ids: unknown): string[] =>
  Array.isArray(ids) ? [...new Set(ids.map(String).filter((id) => genreById.has(id)))] : [];

/** ID TMDB (in OR) per il tipo richiesto; null = nessun filtro; [] = nessun genere scelto esiste per questo tipo */
export function tmdbGenres(ids: string[], type: "movie" | "tv"): number[] | null {
  if (!ids.length) return null;
  return [...new Set(ids.flatMap((id) => genreById.get(id)?.[type] ?? []))];
}
