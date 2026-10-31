import "server-only";
import { randomUUID, randomInt } from "crypto";
import { kv } from "./kv";
import { getDeck } from "./tmdb";
import type { Title, TypeFilter } from "./types";

/*
 * Una stanza vive 24 ore e usa poche chiavi fisse:
 *   r:CODE:meta     JSON con piattaforme, tipo, data
 *   r:CODE:deck     JSON con il mazzo (stesso ordine per tutti)
 *   r:CODE:members  hash  id → nome
 *   r:CODE:seen     hash  id → quanti titoli ha votato
 *   r:CODE:votes    hash  "id|titolo" → 1 (mi piace) / 0 (no)
 *   r:CODE:counts   hash  titolo → quanti "mi piace"
 *   r:CODE:matches  zset  titolo → momento del match
 *   r:CODE:v        contatore che cambia a ogni novità (i client lo controllano ogni 2 secondi)
 */
const TTL = 60 * 60 * 24;
const MAX_MEMBERS = 12;
// Serve almeno un'altra persona: da soli ogni "mi piace" sarebbe un match
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // niente 0/O, 1/I/L
const k = (code: string, part: string) => `r:${code}:${part}`;

export const isCode = (s: string) => /^[A-Z2-9]{4}$/.test(s);
export const isMember = (s: string) => /^[a-f0-9-]{36}$/.test(s);
export const isTitleKey = (s: string) => /^[mt][0-9a-z]{1,10}$/.test(s);
export const cleanName = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 ]/g, "").trim().replace(/\s+/g, " ").slice(0, 16);

export interface RoomMeta { providers: number[]; filter: TypeFilter; genres?: string[]; createdAt: number }
export interface Member { id: string; name: string; seen: number }
export interface RoomState {
  v: number;
  members: Member[];
  counts: Record<string, number>;
  matches: { key: string; at: number }[];
}
export class RoomError extends Error { constructor(msg: string, public status = 400) { super(msg); } }

export async function createRoom(name: string, providers: number[], filter: TypeFilter, genres: string[] = []) {
  const n = cleanName(name);
  if (!n) throw new RoomError("Scrivi il tuo nome.");
  const items = await getDeck(providers, filter, genres);
  if (!items.length) throw new RoomError("Nessun titolo trovato con questi filtri: prova ad aggiungere piattaforme o generi.");
  for (let i = items.length - 1; i > 0; i--) { const j = randomInt(i + 1); [items[i], items[j]] = [items[j], items[i]]; }

  const meta: RoomMeta = { providers, filter, genres, createdAt: Date.now() };
  let code = "";
  for (let tries = 0; tries < 20 && !code; tries++) {
    const c = Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
    if (await kv.setNX(k(c, "meta"), JSON.stringify(meta), TTL)) code = c;
  }
  if (!code) throw new RoomError("Non riesco a creare la stanza, riprova.", 503);

  const id = randomUUID();
  await Promise.all([
    kv.setNX(k(code, "deck"), JSON.stringify(items), TTL),
    kv.setNX(k(code, "v"), "1", TTL),
    kv.hset(k(code, "members"), { [id]: n }),
    kv.hset(k(code, "seen"), { [id]: 0 }),
    kv.hset(k(code, "votes"), { _: 0 }),
    kv.hset(k(code, "counts"), { _: 0 }),
    kv.zaddNX(k(code, "matches"), 0, "_"),
  ]);
  await Promise.all(["members", "seen", "votes", "counts", "matches"].map((p) => kv.expire(k(code, p), TTL)));
  return { code, member: id, name: n, meta, deck: items, voted: [] as string[], liked: [] as string[] };
}

async function loadRoom(code: string) {
  const [meta, deck] = await Promise.all([kv.get(k(code, "meta")), kv.get(k(code, "deck"))]);
  if (!meta || !deck) throw new RoomError("Questa stanza non esiste o è scaduta (le stanze durano 24 ore).", 404);
  return { meta: JSON.parse(meta) as RoomMeta, deck: JSON.parse(deck) as Title[] };
}

/** Info per la pagina di invito: chi c'è e con quali filtri */
export async function roomInfo(code: string) {
  const { meta } = await loadRoom(code);
  const members = Object.values(await kv.hgetall(k(code, "members")));
  return { meta, members };
}

/** Entra nella stanza; se `member` è già dentro (stesso telefono) rientra con i suoi voti */
export async function joinRoom(code: string, name: string, member?: string) {
  const { meta, deck } = await loadRoom(code);
  const members = await kv.hgetall(k(code, "members"));
  if (member && members[member]) {
    const votes = await kv.hgetall(k(code, "votes"));
    const mine = Object.entries(votes).filter(([f]) => f.startsWith(member + "|"));
    return {
      code, member, name: members[member], meta, deck,
      voted: mine.map(([f]) => f.slice(member.length + 1)),
      liked: mine.filter(([, v]) => v === "1").map(([f]) => f.slice(member.length + 1)),
    };
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
  return { code, member: id, name: n, meta, deck, voted: [] as string[], liked: [] as string[] };
}

export async function roomState(code: string, since?: number): Promise<RoomState | { v: number; same: true }> {
  const v = await kv.get(k(code, "v"));
  if (v == null) throw new RoomError("Questa stanza non esiste o è scaduta.", 404);
  if (since && Number(v) === since) return { v: since, same: true };
  const [members, seen, counts, matches] = await Promise.all([
    kv.hgetall(k(code, "members")), kv.hgetall(k(code, "seen")),
    kv.hgetall(k(code, "counts")), kv.zall(k(code, "matches")),
  ]);
  return {
    v: Number(v),
    members: Object.entries(members).map(([id, name]) => ({ id, name, seen: Number(seen[id] ?? 0) })),
    counts: Object.fromEntries(Object.entries(counts).filter(([key, c]) => key !== "_" && Number(c) > 0).map(([key, c]) => [key, Number(c)])),
    matches: matches.filter((m) => m.member !== "_").map((m) => ({ key: m.member, at: m.score })),
  };
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
    if (n >= 2 && c >= n) { await kv.zaddNX(k(code, "matches"), Date.now(), key); match = true; }
  }
  await kv.incr(k(code, "v"));
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
}
