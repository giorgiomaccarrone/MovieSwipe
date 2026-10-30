export type MediaType = "movie" | "tv";
export type TypeFilter = "all" | "movie" | "tv";

export interface Provider {
  id: number;
  name: string;
  logo: string | null; // URL completo o null
}

export interface Title {
  key: string; // "m603" (film) o "t1399" (serie): prefisso + ID TMDB in base 36
  type: MediaType;
  title: string;
  year: number | null;
  overview: string;
  poster: string | null; // URL completo
  rating: number | null; // voto medio TMDB 0-10
  genres: string[];
  providers: string[]; // nomi delle piattaforme (in abbonamento) su cui è disponibile in Italia
}
