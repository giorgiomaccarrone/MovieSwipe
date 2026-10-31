import "server-only";
import { Redis } from "@upstash/redis";

/**
 * Archivio chiave-valore minimo usato dalle stanze.
 * In produzione: Upstash Redis (variabili create da Vercel → Storage).
 * Senza variabili: memoria del processo, utile solo in sviluppo/test.
 */
export interface KV {
  get(k: string): Promise<string | null>;
  setNX(k: string, v: string, ttl: number): Promise<boolean>;
  incr(k: string): Promise<number>;
  expire(k: string, ttl: number): Promise<void>;
  hset(k: string, obj: Record<string, string | number>): Promise<void>;
  hsetnx(k: string, f: string, v: string): Promise<boolean>;
  hget(k: string, f: string): Promise<string | null>;
  hdel(k: string, f: string): Promise<void>;
  hgetall(k: string): Promise<Record<string, string>>;
  hlen(k: string): Promise<number>;
  hincrby(k: string, f: string, n: number): Promise<number>;
  zaddNX(k: string, score: number, member: string): Promise<void>;
  zall(k: string): Promise<{ member: string; score: number }[]>;
}

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const hasDatabase = !!(URL_ && TOKEN);

function upstash(): KV {
  const r = new Redis({ url: URL_!, token: TOKEN!, automaticDeserialization: false });
  const str = (o: Record<string, unknown> | null) =>
    Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, String(v)]));
  return {
    get: async (k) => { const v = await r.get<string>(k); return v == null ? null : String(v); },
    setNX: async (k, v, ttl) => (await r.set(k, v, { nx: true, ex: ttl })) === "OK",
    incr: (k) => r.incr(k),
    expire: async (k, ttl) => { await r.expire(k, ttl); },
    hset: async (k, obj) => { await r.hset(k, obj); },
    hsetnx: async (k, f, v) => (await r.hsetnx(k, f, v)) === 1,
    hget: async (k, f) => { const v = await r.hget<string>(k, f); return v == null ? null : String(v); },
    hdel: async (k, f) => { await r.hdel(k, f); },
    hgetall: async (k) => str(await r.hgetall<Record<string, unknown>>(k)),
    hlen: (k) => r.hlen(k),
    hincrby: (k, f, n) => r.hincrby(k, f, n),
    zaddNX: async (k, score, member) => { await r.zadd(k, { nx: true }, { score, member }); },
    zall: async (k) => {
      const flat = (await r.zrange(k, 0, -1, { withScores: true })) as (string | number)[];
      const out: { member: string; score: number }[] = [];
      for (let i = 0; i + 1 < flat.length; i += 2) out.push({ member: String(flat[i]), score: Number(flat[i + 1]) });
      return out;
    },
  };
}

function memory(): KV {
  const g = globalThis as unknown as { __pmKV?: Map<string, unknown> };
  const m = (g.__pmKV ??= new Map<string, unknown>());
  const hash = (k: string) => { let h = m.get(k) as Map<string, string> | undefined; if (!h) { h = new Map(); m.set(k, h); } return h; };
  const zset = (k: string) => { let z = m.get(k) as Map<string, number> | undefined; if (!z) { z = new Map(); m.set(k, z); } return z; };
  return {
    get: async (k) => (m.has(k) ? String(m.get(k)) : null),
    setNX: async (k, v) => { if (m.has(k)) return false; m.set(k, v); return true; },
    incr: async (k) => { const n = Number(m.get(k) ?? 0) + 1; m.set(k, String(n)); return n; },
    expire: async () => {},
    hset: async (k, obj) => { const h = hash(k); for (const [f, v] of Object.entries(obj)) h.set(f, String(v)); },
    hsetnx: async (k, f, v) => { const h = hash(k); if (h.has(f)) return false; h.set(f, v); return true; },
    hget: async (k, f) => hash(k).get(f) ?? null,
    hdel: async (k, f) => { hash(k).delete(f); },
    hgetall: async (k) => Object.fromEntries(hash(k)),
    hlen: async (k) => hash(k).size,
    hincrby: async (k, f, n) => { const h = hash(k); const v = Number(h.get(f) ?? 0) + n; h.set(f, String(v)); return v; },
    zaddNX: async (k, score, member) => { const z = zset(k); if (!z.has(member)) z.set(member, score); },
    zall: async (k) => [...zset(k)].map(([member, score]) => ({ member, score })).sort((a, b) => a.score - b.score),
  };
}

export const kv: KV = hasDatabase ? upstash() : memory();
