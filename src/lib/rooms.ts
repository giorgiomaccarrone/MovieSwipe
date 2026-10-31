import "server-only";
import { randomUUID, randomInt } from "crypto";
import { kv } from "./kv";
import { getDeck } from "./tmdb";
import type { Title, TypeFilter } from "./types";

/*
 * Scadenza: una stanza con almeno un match non scade mai. Una stanza senza match (di prova o
 * abbandonata) sparisce dopo 30 giorni dall'ultimo ingresso, così il database gratuito non si riempie.
 * Usa poche chiavi fisse:
 *   r:CODE:meta     JSON con nome, piattaforme, tipo, generi, giro
 *   r:CODE:deck     JSON con il mazzo (stesso ordine per tutti; i nuovi giri si aggiungono in fondo)
 *   r:CODE:members  hash  id → nome
 *   r:CODE:seen     hash  id → quanti titoli ha votato
 *   r:CODE:votes    hash  "id|titolo" → 1 (mi piace) / 0 (no)
 *   r:CODE:counts   hash  titolo → quanti "mi piace"
 *   r:CODE:matches  zset  titolo → momento del match
 *   r:CODE:watched  hash  titolo → momento in cui è stato segnato come visto
 *   r:CODE:v        contatore che cambia a ogni novità (i client lo controllano a intervalli)
 */
const TTL = 60 * 60 * 24 * 30;
const PARTS = ["meta", "deck", "members", "seen", "votes", "counts", "matches", "watched", "v"];
const MAX_MEMBERS = 12;
const MAX_DECK = 400; // il mazzo cresce a ogni giro; oltre questo limite i giri non aggiungono altro
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // niente 0/O, 1/I/L
const k = (code: string, part: string) => `r:${code}:${part}`;

export const isCode = (s: string) => /^[A-Z2-9]{4}$/.test(s);
export const isMember = (s: string) => /^[a-f0-9-]{36}$/.test(s);
export const isTitleKey = (s: string) => /^[mt][0-9a-z]{1,10}$/.test(s);
export const cleanName = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 ]/g, "").trim().replace(/\s+/g, " ").slice(0, 16);
const cleanRoomName = (s: string) => (s || "").replace(/[<>]/g, "").trim().replace(/\s+/g, " ").slice(0, 32);

export interface RoomMeta {
  name?: string; providers: number[]; filter: TypeFilter; genres?: string[];
  round?: number; deckSize?: number; createdAt: number;
}
export interface Member { id: string; name: string; seen: number }
export interface RoomState {
  v: number;
  members: Member[];
  counts: Record<string, number>;
  matches: { key: string; at: number }[];
  watched: Record<string, number>;
  deckSize: number;
}
export class RoomError extends Error { constructor(msg: string, public status = 400) { super(msg); } }

const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export async function createRoom(name: string, providers: number[], filter: TypeFilter, genres: string[] = [], roomName = "") {
  const n = cleanName(name);
  if (!n) throw new RoomError("Scrivi il tuo nome.");
  const items = shuffle(await getDeck(providers, filter, genres));
  if (!items.length) throw new RoomError("Nessun titolo trovato con questi filtri: prova ad aggiungere piattaforme o generi.");

  const meta: RoomMeta = { name: cleanRoomName(roomName) || undefined, providers, filter, genres, round: 0, deckSize: items.length, createdAt: Date.now() };
  let code = "";
  for (let tries = 0; tries < 20 && !code; tries++) {
    const c = Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    if (await kv.setNX(k(c, "meta"), JSON.stringify(meta), TTL)) code = c;
  }
  if (!code) throw new RoomError("Non riesco a creare la stanza, riprova.", 503);

  const id = randomUUID();
  await Promise.all([
    kv.set(k(code, "deck"), JSON.stringify(items), TTL),
    kv.set(k(code, "v"), "1", TTL),
    kv.hset(k(code, "members"), { [id]: n }),
    kv.hset(k(code, "seen"), { [id]: 0 }),
    kv.hset(k(code, "votes"), { _: 0 }),
    kv.hset(k(code, "counts"), { _: 0 }),
    kv.hset(k(code, "watched"), { _: 0 }),
    kv.zaddNX(k(code, "matches"), 0, "_"),
  ]);
  await Promise.all(["members", "seen", "votes", "counts", "matches", "watched"].map((p) => kv.expire(k(code, p), TTL)));
  return { code, member: id, name: n, meta, deck: items, voted: [] as string[], liked: [] as string[] };
}

/** Aggiorna la scadenza: con almeno un match la stanza diventa permanente, altrimenti rinnova i 30 giorni */
async function touch(code: string) {
  await kv.hsetnx(k(code, "watched"), "_", "0"); // le stanze create prima di questa versione non avevano la chiave
  const hasMatches = (await kv.zall(k(code, "matches"))).some((m) => m.member !== "_");
  await Promise.all(PARTS.map((p) => (hasMatches ? kv.persist(k(code, p)) : kv.expire(k(code, p), TTL))));
}

async function loadRoom(code: string) {
  const [meta, deck] = await Promise.all([kv.get(k(code, "meta")), kv.get(k(code, "deck"))]);
  if (!meta || !deck) throw new RoomError("Questa stanza non esiste più. Le stanze senza nessun match spariscono dopo 30 giorni senza utilizzo; quelle con almeno un match restano per sempre.", 404);
  return { meta: JSON.parse(meta) as RoomMeta, deck: JSON.parse(deck) as Title[] };
}

/** Info per la pagina di invito: chi c'è e con quali filtri */
export async function roomInfo(code: string) {
  const { meta } = await loadRoom(code);
  const members = Object.values(await kv.hgetall(k(code, "members")));
  return { meta, members };
}

/** Il mazzo aggiornato (dopo un nuovo giro) */
export async function roomDeck(code: string) {
  return loadRoom(code);
}

async function myVotes(code: string, member: string) {
  const votes = await kv.hgetall(k(code, "votes"));
  const mine = Object.entries(votes).filter(([f]) => f.startsWith(member + "|"));
  return {
    voted: mine.map(([f]) => f.slice(member.length + 1)),
    liked: mine.filter(([, v]) => v === "1").map(([f]) => f.slice(member.length + 1)),
  };
}

/** Entra nella stanza; se `member` è già dentro (stesso telefono) rientra con i suoi voti */
export async function joinRoom(code: string, name: string, member?: string) {
  const { meta, deck } = await loadRoom(code);
  const members = await kv.hgetall(k(code, "members"));
  if (member && members[member]) {
    await touch(code);
    return { code, member, name: members[member], meta, deck, ...(await myVotes(code, member)) };
  }
  const base = cleanName(name);
  if (!base) throw new RoomError("Scrivi il tuo nome.");
  if (Object.keys(members).length >= MAX_MEMBERS) throw new RoomError(`La stanza è piena (massimo ${MAX_MEMBERS} persone).`);
  const taken = new Set(Object.values(members).map((x) => x.toLowerCase()));
  let n = base, i = 2;
  while (taken.has(n.toLowerCase())) n = `${base} ${i++}`;
  const id = randomUUID();
  await kv.hset(k(code, "members"), { [id]: n });
  await kv.hset(k(code, "seen"), { [id]: 0 });
  await kv.incr(k(code, "v"));
  await touch(code);
  return { code, member: id, name: n, meta, deck, voted: [] as string[], liked: [] as string[] };
}

/** "Sono io": riprende il posto di un partecipante dal suo nome (es. dopo aver cambiato telefono).
 *  Il codice della stanza fa da password del gruppo. */
export async function claimMember(code: string, name: string) {
  const { meta, deck } = await loadRoom(code);
  const members = await kv.hgetall(k(code, "members"));
  const found = Object.entries(members).find(([, n]) => n.toLowerCase() === cleanName(name).toLowerCase());
  if (!found) throw new RoomError("Non trovo nessuno con questo nome nella stanza.", 404);
  const [id, n] = found;
  await touch(code);
  return { code, member: id, name: n, meta, deck, ...(await myVotes(code, id)) };
}

export async function roomState(code: string, since?: number): Promise<RoomState | { v: number; same: true }> {
  const v = await kv.get(k(code, "v"));
  if (v == null) throw new RoomError("Questa stanza non esiste o è scaduta.", 404);
  if (since && Number(v) === since) return { v: since, same: true };
  const [members, seen, counts, matches, watched, rawMeta] = await Promise.all([
    kv.hgetall(k(code, "members")), kv.hgetall(k(code, "seen")),
    kv.hgetall(k(code, "counts")), kv.zall(k(code, "matches")),
    kv.hgetall(k(code, "watched")), kv.get(k(code, "meta")),
  ]);
  const meta = rawMeta ? (JSON.parse(rawMeta) as RoomMeta) : null;
  return {
    v: Number(v),
    members: Object.entries(members).map(([id, name]) => ({ id, name, seen: Number(seen[id] ?? 0) })),
    counts: Object.fromEntries(Object.entries(counts).filter(([key, c]) => key !== "_" && Number(c) > 0).map(([key, c]) => [key, Number(c)])),
    matches: matches.filter((m) => m.member !== "_").map((m) => ({ key: m.member, at: m.score })),
    watched: Object.fromEntries(Object.entries(watched).filter(([key]) => key !== "_").map(([key, t]) => [key, Number(t)])),
    deckSize: meta?.deckSize ?? 0,
  };
}

/** Riepilogo per "Le tue stanze" in home (solo stanze di cui il telefono conosce il codice) */
export async function summaries(codes: string[]) {
  const out = await Promise.all(codes.slice(0, 10).map(async (code) => {
    const [meta, matches, watched, members] = await Promise.all([
      kv.get(k(code, "meta")), kv.zall(k(code, "matches")), kv.hgetall(k(code, "watched")), kv.hgetall(k(code, "members")),
    ]);
    if (!meta) return { code, gone: true as const };
    const m = JSON.parse(meta) as RoomMeta;
    const keys = matches.filter((x) => x.member !== "_").map((x) => x.member);
    return {
      code, name: m.name ?? null, members: Object.values(members),
      matches: keys.length, toWatch: keys.filter((key) => !watched[key]).length,
    };
  }));
  return { rooms: out };
}

async function requireMember(code: string, member: string) {
  if (!(await kv.hget(k(code, "members"), member))) throw new RoomError("Non sei in questa stanza.", 403);
}

export async function vote(code: string, member: string, key: string, like: boolean) {
  await requireMember(code, member);
  const fresh = await kv.hsetnx(k(code, "votes"), `${member}|${key}`, like ? "1" : "0");
  if (!fresh) return { match: false };
  await kv.hincrby(k(code, "seen"), member, 1);
  let match = false;
  if (like) {
    const [c, n] = await Promise.all([kv.hincrby(k(code, "counts"), key, 1), kv.hlen(k(code, "members"))]);
    // Serve almeno un'altra persona: da soli ogni "mi piace" sarebbe un match
    if (n >= 2 && c >= n) { await kv.zaddNX(k(code, "matches"), Date.now(), key); match = true; }
  }
  await kv.incr(k(code, "v"));
  if (match) await touch(code); // primo match: da qui la stanza non scade più
  return { match };
}

export async function unvote(code: string, member: string, key: string) {
  await requireMember(code, member);
  const f = `${member}|${key}`;
  const was = await kv.hget(k(code, "votes"), f);
  if (was == null) return;
  await kv.hdel(k(code, "votes"), f);
  await kv.hincrby(k(code, "seen"), member, -1);
  if (was === "1") await kv.hincrby(k(code, "counts"), key, -1);
  await kv.incr(k(code, "v"));
}

/** Segna (o toglie) un match come già visto: vale per tutta la stanza */
export async function setWatched(code: string, member: string, key: string, watched: boolean) {
  await requireMember(code, member);
  if (watched) await kv.hset(k(code, "watched"), { [key]: Date.now() });
  else await kv.hdel(k(code, "watched"), key);
  await kv.incr(k(code, "v"));
}

/** Nuovo giro: aggiunge in fondo al mazzo titoli mai proposti in questa stanza, con filtri eventualmente diversi */
export async function newRound(code: string, member: string, providers: number[], filter: TypeFilter, genres: string[]) {
  await requireMember(code, member);
  const { meta, deck } = await loadRoom(code);
  if (deck.length >= MAX_DECK) throw new RoomError("In questa stanza avete già visto tantissimi titoli: create una stanza nuova per ripartire.");
  const known = new Set(deck.map((t) => t.key));
  const fresh: Title[] = [];
  // Scorro le pagine di TMDB finché trovo abbastanza titoli nuovi (al massimo 4 blocchi)
  for (let w = 0; w < 4 && fresh.length < 40; w++) {
    const page = await getDeck(providers, filter, genres, w);
    if (!page.length) break;
    for (const t of page) if (!known.has(t.key)) { known.add(t.key); fresh.push(t); }
  }
  if (!fresh.length) throw new RoomError("Non ci sono altri titoli nuovi con questi filtri: prova ad aggiungere piattaforme o generi.");
  const added = shuffle(fresh).slice(0, Math.min(60, MAX_DECK - deck.length));
  const nextDeck = [...deck, ...added];
  const nextMeta = { ...meta, providers, filter, genres, round: (meta.round ?? 0) + 1, deckSize: nextDeck.length };
  await kv.set(k(code, "deck"), JSON.stringify(nextDeck), TTL);
  await kv.set(k(code, "meta"), JSON.stringify(nextMeta), TTL);
  await kv.incr(k(code, "v"));
  await touch(code); // set() rimette la scadenza: se la stanza ha match torna permanente
  return { added: added.length, meta: nextMeta, deck: nextDeck };
}

/** Esce: i suoi voti spariscono e i titoli che ora piacciono a tutti i rimasti diventano match */
export async function leave(code: string, member: string) {
  await requireMember(code, member);
  await kv.hdel(k(code, "members"), member);
  await kv.hdel(k(code, "seen"), member);
  const votes = await kv.hgetall(k(code, "votes"));
  for (const [f, val] of Object.entries(votes)) {
    if (!f.startsWith(member + "|")) continue;
    await kv.hdel(k(code, "votes"), f);
    if (val === "1") await kv.hincrby(k(code, "counts"), f.slice(member.length + 1), -1);
  }
  const n = await kv.hlen(k(code, "members"));
  if (n >= 2) {
    const counts = await kv.hgetall(k(code, "counts"));
    const now = Date.now();
    await Promise.all(Object.entries(counts)
      .filter(([key, c]) => key !== "_" && Number(c) >= n)
      .map(([key]) => kv.zaddNX(k(code, "matches"), now, key)));
  }
  await kv.incr(k(code, "v"));
  await touch(code);
}
