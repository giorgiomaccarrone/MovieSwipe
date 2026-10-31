// Catalogo di esempio usato quando manca TMDB_API_KEY (sviluppo locale e test).
import type { Provider, Title, TypeFilter, MediaType } from "./types";
import { genreById } from "./genres";

export const demoProviders: Provider[] = [
  { id: 8, name: "Netflix", logo: null },
  { id: 119, name: "Prime Video", logo: null },
  { id: 337, name: "Disney+", logo: null },
  { id: 350, name: "Apple TV+", logo: null },
  { id: 222, name: "RaiPlay", logo: null },
];

type Row = [string, MediaType, number, number, string[], string];
const ROWS: Row[] = [
  ["Stranger Things", "tv", 2016, 8, ["Fantascienza", "Horror"], "Un gruppo di ragazzini di una cittadina dell'Indiana affronta forze soprannaturali dopo la scomparsa di un amico."],
  ["Squid Game", "tv", 2021, 8, ["Thriller"], "Persone sommerse dai debiti accettano di sfidarsi in giochi per bambini con un premio enorme e regole letali."],
  ["Mercoledì", "tv", 2022, 8, ["Commedia", "Mistero"], "Mercoledì Addams indaga su una serie di omicidi mentre frequenta la Nevermore Academy."],
  ["Dark", "tv", 2017, 8, ["Fantascienza"], "In un paese tedesco la scomparsa di due bambini porta a galla segreti che legano più generazioni."],
  ["La casa di carta", "tv", 2017, 8, ["Azione", "Thriller"], "Il Professore guida una banda di rapinatori nell'assalto alla Zecca di Spagna."],
  ["Bridgerton", "tv", 2020, 8, ["Romantico", "Drammatico"], "Amori, matrimoni e scandali nell'alta società londinese di inizio Ottocento."],
  ["The Crown", "tv", 2016, 8, ["Drammatico"], "Il regno di Elisabetta II, dalla giovane regina agli anni più recenti."],
  ["Il Gattopardo", "tv", 2025, 8, ["Drammatico", "Storico"], "Il principe di Salina assiste alla fine del suo mondo nella Sicilia dell'Unità d'Italia."],
  ["The Irishman", "movie", 2019, 8, ["Gangster"], "Un sicario ormai anziano ripercorre decenni al servizio della mafia e il legame con Jimmy Hoffa."],
  ["Glass Onion", "movie", 2022, 8, ["Giallo", "Commedia"], "Il detective Benoit Blanc risolve un delitto sull'isola privata di un miliardario."],
  ["Don't Look Up", "movie", 2021, 8, ["Commedia", "Satira"], "Due astronomi provano ad avvisare il mondo di una cometa in arrivo, ma nessuno li prende sul serio."],
  ["Roma", "movie", 2018, 8, ["Drammatico"], "Un anno nella vita di una domestica a Città del Messico all'inizio degli anni Settanta."],
  ["Tyler Rake", "movie", 2020, 8, ["Azione"], "Un mercenario deve riportare a casa il figlio rapito di un boss del narcotraffico."],
  ["The Boys", "tv", 2019, 119, ["Azione", "Satira"], "Un gruppo di vigilanti sfida supereroi corrotti e coperti da una potente multinazionale."],
  ["Fallout", "tv", 2024, 119, ["Fantascienza"], "Dopo l'apocalisse nucleare una ragazza lascia il suo rifugio sotterraneo per esplorare la superficie."],
  ["Reacher", "tv", 2022, 119, ["Azione", "Thriller"], "Un ex poliziotto militare arriva in una cittadina e finisce dentro una cospirazione."],
  ["Invincible", "tv", 2021, 119, ["Animazione", "Supereroi"], "Il figlio adolescente del supereroe più forte della Terra scopre i propri poteri e i segreti del padre."],
  ["La fantastica signora Maisel", "tv", 2017, 119, ["Commedia"], "Nella New York degli anni Cinquanta una casalinga scopre di avere talento per la stand-up comedy."],
  ["LOL - Chi ride è fuori", "tv", 2021, 119, ["Comedy show"], "Dieci comici chiusi in uno studio per sei ore: vince chi riesce a non ridere."],
  ["Gli Anelli del Potere", "tv", 2022, 119, ["Fantasy"], "Migliaia di anni prima del Signore degli Anelli, la Terra di Mezzo vede la nascita degli anelli."],
  ["Saltburn", "movie", 2023, 119, ["Thriller"], "Uno studente di Oxford passa l'estate nella tenuta del compagno aristocratico che lo affascina."],
  ["La guerra di domani", "movie", 2021, 119, ["Fantascienza", "Azione"], "Soldati dal futuro reclutano gente comune per combattere una guerra contro gli alieni."],
  ["The Mandalorian", "tv", 2019, 337, ["Fantascienza"], "Un cacciatore di taglie solitario protegge un misterioso bambino ai confini della galassia."],
  ["Andor", "tv", 2022, 337, ["Fantascienza", "Spionaggio"], "Un ladro qualunque diventa, passo dopo passo, una figura chiave della ribellione."],
  ["The Bear", "tv", 2022, 337, ["Drammatico", "Commedia"], "Uno chef stellato torna a Chicago per salvare la paninoteca di famiglia."],
  ["Shōgun", "tv", 2024, 337, ["Drammatico", "Storico"], "Nel Giappone del 1600 un navigatore inglese finisce al centro della lotta per il potere tra i signori feudali."],
  ["Only Murders in the Building", "tv", 2021, 337, ["Giallo", "Commedia"], "Tre vicini appassionati di true crime aprono un podcast su un omicidio nel loro palazzo."],
  ["Loki", "tv", 2021, 337, ["Fantascienza", "Supereroi"], "Il dio dell'inganno viene arruolato da un'agenzia che sorveglia il flusso del tempo."],
  ["Inside Out 2", "movie", 2024, 337, ["Animazione"], "Riley entra nell'adolescenza e nella sua mente arrivano emozioni nuove, a partire da Ansia."],
  ["Ted Lasso", "tv", 2020, 350, ["Commedia"], "Un allenatore di football americano finisce ad allenare una squadra di calcio inglese."],
  ["Scissione", "tv", 2022, 350, ["Thriller", "Fantascienza"], "I dipendenti di un'azienda hanno i ricordi del lavoro separati da quelli della vita privata."],
  ["Slow Horses", "tv", 2022, 350, ["Spionaggio"], "Agenti dell'MI5 caduti in disgrazia finiscono in un ufficio di scarto, ma i guai li trovano lo stesso."],
  ["Killers of the Flower Moon", "movie", 2023, 350, ["Drammatico", "Western"], "Negli anni Venti una serie di omicidi colpisce la nazione Osage, arricchita dal petrolio."],
  ["Mare fuori", "tv", 2020, 222, ["Drammatico"], "Le storie dei ragazzi rinchiusi nel carcere minorile di Napoli."],
  ["L'amica geniale", "tv", 2018, 222, ["Drammatico"], "L'amicizia di una vita tra Lenù e Lila, dal rione napoletano degli anni Cinquanta in poi."],
  ["Il commissario Montalbano", "tv", 1999, 222, ["Giallo"], "Il commissario di Vigàta risolve casi tra mare, buona cucina e colleghi indimenticabili."],
  ["Un professore", "tv", 2021, 222, ["Drammatico"], "Un professore di filosofia anticonformista cambia il modo di vedere la vita dei suoi studenti."],
  ["Doc - Nelle tue mani", "tv", 2020, 222, ["Medical drama"], "Un primario perde dodici anni di memoria e ricomincia da capo come medico."],
  ["Don Matteo", "tv", 2000, 222, ["Giallo", "Commedia"], "Un parroco in bicicletta aiuta i carabinieri a risolvere i casi della sua città."],
];

const ALL: Title[] = ROWS.map(([title, type, year, pid, genres, overview], i) => ({
  key: (type === "movie" ? "m" : "t") + (i + 1).toString(36),
  type, title, year, overview, genres, poster: null, rating: null,
  providers: [demoProviders.find((p) => p.id === pid)!.name],
}));
const PID = new Map(ROWS.map((r, i) => [ALL[i].key, r[3]]));

export function demoDeck(providerIds: number[], filter: TypeFilter, genreIds: string[] = []): Title[] {
  const rx = genreIds.map((id) => genreById.get(id)?.demo).filter((r): r is RegExp => !!r);
  return ALL.filter((t) => providerIds.includes(PID.get(t.key)!) && (filter === "all" || t.type === filter)
    && (!rx.length || rx.some((r) => r.test(t.genres.join(" ")))));
}
export function demoDetails(keys: string[]): Title[] {
  return ALL.filter((t) => keys.includes(t.key));
}
