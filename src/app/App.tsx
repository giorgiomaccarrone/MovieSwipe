"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Provider, Title, TypeFilter } from "@/lib/types";
import { GENRES, genreById } from "@/lib/genres";

/* ---------- Tipi delle risposte API ---------- */
interface RoomMeta { name?: string; providers: number[]; filter: TypeFilter; genres?: string[]; round?: number; deckSize?: number }
interface Session {
  code: string; member: string; name: string;
  meta: RoomMeta; deck: Title[]; voted: string[]; liked: string[];
}
interface Member { id: string; name: string; seen: number }
interface RoomState {
  v: number; members: Member[]; counts: Record<string, number>; matches: { key: string; at: number }[];
  watched: Record<string, number>; alreadyBy?: Record<string, string[]>; deckSize: number; name: string | null;
}

/* ---------- Memoria locale (solo comodità: nome, filtri, stanze in cui sono entrato) ---------- */
type RoomsMem = Record<string, { member: string; at: number }>;
const mem = {
  get<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } },
  set(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* non disponibile */ } },
};
const rememberRoom = (code: string, member: string) => { const r = mem.get<RoomsMem>("pm-rooms", {}); r[code] = { member, at: Date.now() }; mem.set("pm-rooms", r); };
const forgetRoom = (code: string) => { const r = mem.get<RoomsMem>("pm-rooms", {}); delete r[code]; mem.set("pm-rooms", r); };
// Le stanze scadute vengono tolte da sole quando il riepilogo risponde che non esistono più
const knownRooms = (): string[] =>
  Object.entries(mem.get<RoomsMem>("pm-rooms", {})).sort((a, b) => b[1].at - a[1].at).map(([c]) => c);

/** Titoli che ho dichiarato "già visto", in qualsiasi stanza: restano solo su questo telefono */
const seenMem = {
  has(key: string) { return mem.get<string[]>("pm-seen", []).includes(key); },
  add(key: string) { const l = mem.get<string[]>("pm-seen", []).filter((k) => k !== key); l.push(key); mem.set("pm-seen", l.slice(-3000)); },
};

async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const r = await fetch(url, {
    method: init?.method ?? "GET", cache: "no-store",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || "Connessione non riuscita, riprova."), { status: r.status });
  return d as T;
}

const TYPE_LABEL: Record<TypeFilter, string> = { all: "Tutto", movie: "Film", tv: "Serie" };
const small = (url: string | null, size = "w185") => (url ? url.replace("/w500/", `/${size}/`) : null);
const metaLine = (t: Title) =>
  [t.type === "movie" ? "Film" : "Serie", t.year, t.rating ? `★ ${t.rating.toFixed(1)}` : null].filter(Boolean).join(" · ");
const HEART = "M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.5h2c.7-1.3 2.2-2.5 4.3-2.5 3.7 0 5.8 3.8 4.3 7.2C19.5 16.4 12 21 12 21z";

/* ======================================================================= */
export default function App({ initialCode }: { initialCode?: string }) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [flags, setFlags] = useState({ demo: false, database: true });
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ providers: Provider[]; demo: boolean; database: boolean }>("/api/providers")
      .then((d) => { setProviders(d.providers); setFlags({ demo: d.demo, database: d.database }); })
      .catch(() => setError("Non riesco a caricare le piattaforme. Ricarica la pagina."));
    // Rientro automatico se questo telefono era già nella stanza del link
    const known = initialCode ? mem.get<RoomsMem>("pm-rooms", {})[initialCode] : undefined;
    if (initialCode && known) {
      api<Session>(`/api/rooms/${initialCode}/join`, { method: "POST", body: { member: known.member } })
        .then(enter).catch(() => { forgetRoom(initialCode); }).finally(() => setBooting(false));
    } else setBooting(false);
  }, [initialCode]);

  /** Passa a un'altra stanza del telefono senza abbandonare quella attuale */
  async function switchRoom(code: string) {
    const known = mem.get<RoomsMem>("pm-rooms", {})[code];
    if (!known) throw new Error("Questa stanza non è più salvata su questo telefono.");
    try { enter(await api<Session>(`/api/rooms/${code}/join`, { method: "POST", body: { member: known.member } })); }
    catch (e) { if ((e as { status?: number }).status === 404) forgetRoom(code); throw e; }
  }

  function enter(s: Session) {
    rememberRoom(s.code, s.member);
    mem.set("pm-name", s.name.replace(/ \d+$/, ""));
    history.replaceState(null, "", `/r/${s.code}`);
    setSession(s); window.scrollTo(0, 0);
  }

  return (
    <>
      {session ? (
        <Room key={session.code} session={session} providers={providers}
          onExit={() => { setSession(null); history.replaceState(null, "", "/"); }}
          onSwitch={switchRoom} />
      ) : (
        <>
          <Ambient src={null} />
          <main className="app">
            {booting ? <div className="loading"><span className="spinner" />Rientro nella stanza…</div> : (
              <Home providers={providers} flags={flags} initialCode={initialCode} bootError={error} onEnter={enter} />
            )}
            <Footer />
          </main>
        </>
      )}
    </>
  );
}

function Footer() {
  return (
    <footer className="note">
      Dati di film e serie da <a href="https://www.themoviedb.org" target="_blank" rel="noopener">TMDB</a>, disponibilità
      streaming da <a href="https://www.justwatch.com/it" target="_blank" rel="noopener">JustWatch</a>. Questo prodotto usa
      l&apos;API di TMDB ma non è approvato né certificato da TMDB.
    </footer>
  );
}

/* ================= Sfondo ================= */
function Ambient({ src }: { src: string | null }) {
  return (
    <div className="ambient" aria-hidden>
      <div className="blobs" />
      {src && <img key={src} src={small(src, "w92")!} alt="" />}
      <div className="veil" />
    </div>
  );
}

/* ================= Filtri (creazione stanza e nuovo giro) ================= */
function Filters({ providers, sel, setSel, filter, setFilter, genres, setGenres, emptyText }: {
  providers: Provider[]; sel: number[]; setSel: (v: number[]) => void;
  filter: TypeFilter; setFilter: (f: TypeFilter) => void;
  genres: string[]; setGenres: (g: string[]) => void; emptyText?: string;
}) {
  const toggle = (id: number) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  // Alcuni generi esistono solo per i film (es. Horror, Romantico): li nascondo se si guardano solo serie
  const shownGenres = GENRES.filter((g) => filter !== "tv" || g.tv.length > 0);
  const active = activeGenresFor(genres, filter);
  const toggleGenre = (id: string) => setGenres(active.includes(id) ? active.filter((x) => x !== id) : [...active, id]);
  return (<>
    <div className="field">
      <span className="lbl">Piattaforme</span>
      <div className="chips">
        {providers.map((p) => (
          <button key={p.id} type="button" className={"chip prov" + (p.logo ? "" : " nologo")} aria-pressed={sel.includes(p.id)} onClick={() => toggle(p.id)}>
            {p.logo && <img src={p.logo} alt="" width={24} height={24} />}{p.name}
          </button>
        ))}
        {!providers.length && <span className="muted small">{emptyText || "Carico le piattaforme…"}</span>}
      </div>
    </div>
    <div className="field">
      <span className="lbl">Cosa guardate</span>
      <div className="segmented" role="radiogroup" aria-label="Cosa guardate">
        {(["all", "movie", "tv"] as TypeFilter[]).map((f) => (
          <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => setFilter(f)}>{TYPE_LABEL[f]}</button>
        ))}
      </div>
    </div>
    <div className="field">
      <div className="lbl-row">
        <span className="lbl">Generi</span>
        {active.length > 0
          ? <button type="button" className="mini-link" onClick={() => setGenres([])}>Tutti i generi</button>
          : <span className="hint-inline">Nessuno scelto = tutti</span>}
      </div>
      <div className="chips">
        {shownGenres.map((g) => (
          <button key={g.id} type="button" className="chip nologo small-chip" aria-pressed={active.includes(g.id)} onClick={() => toggleGenre(g.id)}>{g.label}</button>
        ))}
      </div>
    </div>
  </>);
}
const activeGenresFor = (genres: string[], filter: TypeFilter) =>
  genres.filter((id) => { const g = genreById.get(id); return !!g && (filter !== "tv" || g.tv.length > 0); });

/* ================= Elenco "Le tue stanze" ================= */
function RoomRows({ rooms, busy, onOpen, onForget }: {
  rooms: RoomSummary[]; busy?: boolean; onOpen: (code: string) => void; onForget?: (code: string) => void;
}) {
  return (
    <ul className="rooms">
      {rooms.map((r) => (
        <li key={r.code} className="glass room-row">
          <button className="room-open" onClick={() => onOpen(r.code)} disabled={busy}>
            <span className="room-badge">{r.code}</span>
            <span className="room-text">
              <b>{r.name || `Stanza ${r.code}`}</b>
              <span className="muted small">
                {r.members ? r.members.join(", ") : "…"}
                {r.matches !== undefined && (r.toWatch ? ` · ${r.toWatch} da vedere` : r.matches ? " · tutto visto" : " · ancora nessun match")}
              </span>
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </button>
          {onForget && (
            <button className="room-forget" onClick={() => onForget(r.code)} aria-label={`Togli ${r.name || r.code} da questo telefono`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Riepilogo delle stanze salvate sul telefono (toglie da sole quelle che non esistono più) */
function useRoomSummaries(exclude?: string) {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  useEffect(() => {
    const codes = knownRooms().filter((c) => c !== exclude);
    if (!codes.length) return;
    setRooms(codes.map((c) => ({ code: c })));
    api<{ rooms: RoomSummary[] }>(`/api/rooms/summary?codes=${codes.join(",")}`).then((d) => {
      d.rooms.filter((r) => r.gone).forEach((r) => forgetRoom(r.code));
      setRooms(d.rooms.filter((r) => !r.gone));
    }).catch(() => {});
  }, [exclude]);
  return [rooms, setRooms] as const;
}

/* ================= Home: crea o entra ================= */
interface RoomSummary { code: string; name?: string | null; members?: string[]; matches?: number; toWatch?: number; gone?: true }

function Home({ providers, flags, initialCode, bootError, onEnter }: {
  providers: Provider[]; flags: { demo: boolean; database: boolean }; initialCode?: string; bootError: string;
  onEnter: (s: Session) => void;
}) {
  const [mode, setMode] = useState<"create" | "join">(initialCode ? "join" : "create");
  const [name, setName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [sel, setSel] = useState<number[]>([]);
  const [filter, setFilter] = useState<TypeFilter>("all");
  const [genres, setGenres] = useState<string[]>([]);
  const [code, setCode] = useState(initialCode ?? "");
  const [info, setInfo] = useState<{ members: string[]; meta: Session["meta"] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Le stanze salvate su questo telefono, con quanti match restano da vedere
  const [rooms, setRooms] = useRoomSummaries();

  useEffect(() => {
    setName(mem.get("pm-name", ""));
    const prefs = mem.get<{ providers: number[]; filter: TypeFilter; genres?: string[] } | null>("pm-prefs", null);
    if (prefs) { setSel(prefs.providers); setFilter(prefs.filter); setGenres(prefs.genres ?? []); }
  }, []);
  useEffect(() => { if (!sel.length && providers.length && !mem.get("pm-prefs", null)) setSel(providers.slice(0, 4).map((p) => p.id)); }, [providers, sel.length]);

  // Anteprima della stanza dell'invito
  const cleanCode = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  useEffect(() => {
    setInfo(null);
    if (cleanCode.length !== 4) return;
    let alive = true;
    api<{ members: string[]; meta: Session["meta"] }>(`/api/rooms/${cleanCode}`)
      .then((d) => alive && (setInfo(d), setError("")))
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [cleanCode]);

  const provName = (id: number) => providers.find((p) => p.id === id)?.name;
  const activeGenres = activeGenresFor(genres, filter);

  async function submit() {
    if (!name.trim()) return setError("Scrivi il tuo nome, così gli altri sanno chi sei.");
    setBusy(true); setError("");
    try {
      if (mode === "create") {
        mem.set("pm-prefs", { providers: sel, filter, genres: activeGenres });
        onEnter(await api<Session>("/api/rooms", { method: "POST", body: { name, roomName, providers: sel, filter, genres: activeGenres } }));
      } else {
        if (cleanCode.length !== 4) throw new Error("Il codice della stanza ha 4 caratteri.");
        onEnter(await api<Session>(`/api/rooms/${cleanCode}/join`, { method: "POST", body: { name } }));
      }
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  async function rejoin(c: string) {
    const known = mem.get<RoomsMem>("pm-rooms", {})[c];
    if (!known) return;
    setBusy(true);
    try { onEnter(await api<Session>(`/api/rooms/${c}/join`, { method: "POST", body: { member: known.member } })); }
    catch (e) { forgetRoom(c); setRooms((r) => r.filter((x) => x.code !== c)); setError((e as Error).message); setBusy(false); }
  }

  async function claim(who: string) {
    setBusy(true); setError("");
    try { onEnter(await api<Session>(`/api/rooms/${cleanCode}/claim`, { method: "POST", body: { name: who } })); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }

  return (
    <>
      <header className="hero">
        <img className="logo" src="/icon.svg" alt="" width={72} height={72} />
        <h1>Filmetto</h1>
        <p className="lead">Create una stanza e fate swipe insieme su film e serie. Quando una cosa piace a tutti, è match.</p>
        {flags.demo && <p className="pill warn">Modalità demo: manca la chiave TMDB</p>}
        {!flags.database && <p className="pill warn">Database non collegato: le stanze funzionano solo su questo server</p>}
      </header>

      {rooms.length > 0 && (
        <section className="stack-s">
          <span className="lbl">Le tue stanze</span>
          <RoomRows rooms={rooms} busy={busy} onOpen={rejoin}
            onForget={(c) => { forgetRoom(c); setRooms((x) => x.filter((y) => y.code !== c)); }} />
        </section>
      )}

      <form className="glass panel" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="segmented two" role="tablist" aria-label="Cosa vuoi fare">
          <button type="button" role="tab" aria-selected={mode === "create"} aria-checked={mode === "create"} onClick={() => { setMode("create"); setError(""); }}>Crea stanza</button>
          <button type="button" role="tab" aria-selected={mode === "join"} aria-checked={mode === "join"} onClick={() => { setMode("join"); setError(""); }}>Ho un codice</button>
        </div>

        {mode === "join" && (
          <div className="field">
            <label className="lbl" htmlFor="code">Codice della stanza</label>
            <input id="code" type="text" className="code-input" inputMode="text" autoCapitalize="characters" autoComplete="off" maxLength={4}
              value={cleanCode} onChange={(e) => setCode(e.target.value)} />
            {info && (
              <p className="muted small">
                {info.meta.name ? <><b className="ink">{info.meta.name}</b> · </> : null}
                {TYPE_LABEL[info.meta.filter]} su {info.meta.providers.map(provName).filter(Boolean).join(", ") || "piattaforme scelte"}
                {info.meta.genres?.length ? <> · {info.meta.genres.map((id) => genreById.get(id)?.label).filter(Boolean).join(", ")}</> : null}
              </p>
            )}
          </div>
        )}

        {mode === "join" && info && info.members.length > 0 && (
          <div className="field claim">
            <span className="lbl">Eri già dentro? Tocca il tuo nome</span>
            <div className="chips">
              {info.members.map((m) => (
                <button key={m} type="button" className="chip nologo small-chip" onClick={() => claim(m)} disabled={busy}>{m}</button>
              ))}
            </div>
            <span className="hint-inline">Riprendi i tuoi voti anche da un altro telefono. Se sei nuovo, scrivi il tuo nome qui sotto.</span>
          </div>
        )}

        <div className="field">
          <label className="lbl" htmlFor="name">{mode === "join" && info?.members.length ? "Sei nuovo? Il tuo nome" : "Il tuo nome"}</label>
          <input id="name" type="text" maxLength={16} autoComplete="given-name" autoCapitalize="words" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        {mode === "create" && (<>
          <div className="field">
            <div className="lbl-row">
              <label className="lbl" htmlFor="roomname">Nome della stanza</label>
              <span className="hint-inline">Facoltativo</span>
            </div>
            <input id="roomname" type="text" maxLength={40} autoComplete="off" value={roomName} onChange={(e) => setRoomName(e.target.value)} />
          </div>
          <Filters {...{ providers, sel, setSel, filter, setFilter, genres, setGenres }} emptyText={bootError} />
        </>)}

        {error && <p className="err">{error}</p>}
        <button className="btn primary" disabled={busy || (mode === "create" ? !sel.length : cleanCode.length !== 4)}>
          {busy ? "Un attimo…" : mode === "create" ? "Crea la stanza" : "Entra nella stanza"}
        </button>
      </form>
    </>
  );
}

/* ================= Stanza ================= */
const POLL_ACTIVE = 3000;   // mentre si vota: i match arrivano in pochi secondi
const POLL_IDLE = 12000;    // se nessuno tocca il telefono da 2 minuti: meno richieste, resta tutto gratis
const IDLE_AFTER = 2 * 60 * 1000;

function Room({ session, providers, onExit, onSwitch }: {
  session: Session; providers: Provider[]; onExit: () => void; onSwitch: (code: string) => Promise<void>;
}) {
  const { code, member } = session;
  const [deck, setDeck] = useState<Title[]>(session.deck);
  const [meta, setMeta] = useState<RoomMeta>(session.meta);
  const byKey = useMemo(() => new Map(deck.map((t) => [t.key, t])), [deck]);
  const [voted, setVoted] = useState<Set<string>>(() => new Set(session.voted));
  const [history_, setHistory] = useState<string[]>([]);
  const [state, setState] = useState<RoomState | null>(null);
  const [watchedLocal, setWatchedLocal] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<"swipe" | "list">("swipe");
  const [detail, setDetail] = useState<{ t: Title; canVote: boolean } | null>(null);
  const [invite, setInvite] = useState(false);
  const [round, setRound] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [popups, setPopups] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [gone, setGone] = useState("");
  const seenMatches = useRef<Set<string> | null>(null);
  const vRef = useRef(0);
  const deckLen = useRef(deck.length);
  deckLen.current = deck.length;
  const lastActive = useRef(Date.now());
  // Barra in alto: diventa di vetro appena si scorre la pagina
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll(); addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, []);

  /* --- aggiornamenti: una lettura leggera che dice solo "è cambiato qualcosa?" --- */
  const poll = useCallback(async () => {
    try {
      const d = await api<RoomState | { v: number; same: true }>(`/api/rooms/${code}/state?v=${vRef.current}`);
      if ("same" in d) return;
      vRef.current = d.v;
      setState(d);
      setWatchedLocal({});
      setMeta((m) => ((m.name ?? null) === d.name ? m : { ...m, name: d.name ?? undefined })); // rinominata da qualcuno
      // Qualcuno ha avviato un nuovo giro: scarico il mazzo aggiornato
      if (d.deckSize && d.deckSize !== deckLen.current) {
        api<{ meta: RoomMeta; deck: Title[] }>(`/api/rooms/${code}/deck`).then((r) => { setDeck(r.deck); setMeta(r.meta); }).catch(() => {});
      }
      const keys = d.matches.map((m) => m.key);
      if (!seenMatches.current) { seenMatches.current = new Set(keys); return; } // all'ingresso niente popup per i match vecchi
      const fresh = keys.filter((k) => !seenMatches.current!.has(k));
      if (fresh.length) {
        fresh.forEach((k) => seenMatches.current!.add(k));
        setPopups((p) => [...p, ...fresh]);
        try { navigator.vibrate?.([30, 40, 30]); } catch { /* non supportato */ }
      }
    } catch (e) {
      if ((e as { status?: number }).status === 404) { forgetRoom(code); setGone((e as Error).message); }
    }
  }, [code]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const loop = async () => {
      if (document.visibilityState === "visible") await poll();
      if (!alive) return;
      timer = setTimeout(loop, Date.now() - lastActive.current > IDLE_AFTER ? POLL_IDLE : POLL_ACTIVE);
    };
    loop();
    const wake = () => { lastActive.current = Date.now(); };
    const vis = () => { if (document.visibilityState === "visible") { wake(); poll(); } };
    document.addEventListener("visibilitychange", vis);
    addEventListener("pointerdown", wake); addEventListener("keydown", wake);
    return () => {
      alive = false; clearTimeout(timer);
      document.removeEventListener("visibilitychange", vis);
      removeEventListener("pointerdown", wake); removeEventListener("keydown", wake);
    };
  }, [poll]);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2600); return () => clearTimeout(t); }, [toast]);

  /* --- mazzo: prima i titoli che piacciono già agli altri, così il match arriva prima --- */
  const pinned = useRef<string | null>(null);
  const queue = useMemo(() => {
    const counts = state?.counts ?? {};
    const rest = deck.filter((t) => !voted.has(t.key));
    const cur = pinned.current && rest.find((t) => t.key === pinned.current);
    const others = rest.filter((t) => t !== cur)
      .map((t, i) => ({ t, i, c: counts[t.key] ?? 0 }))
      .sort((a, b) => (b.c > 0 ? 1 : 0) - (a.c > 0 ? 1 : 0) || b.c - a.c || a.i - b.i)
      .map((x) => x.t);
    return cur ? [cur, ...others] : others;
  }, [deck, voted, state?.counts]);
  pinned.current = queue[0]?.key ?? null;

  const vote = useCallback((t: Title, like: boolean, seen = false) => {
    lastActive.current = Date.now();
    if (seen) seenMem.add(t.key);
    setVoted((v) => new Set(v).add(t.key));
    setHistory((h) => [...h, t.key]);
    api<{ match: boolean }>(`/api/rooms/${code}/vote`, { method: "POST", body: { member, key: t.key, like, seen } })
      .then((r) => {
        if (r.match && seenMatches.current && !seenMatches.current.has(t.key)) {
          seenMatches.current.add(t.key); setPopups((p) => [...p, t.key]);
          try { navigator.vibrate?.([30, 40, 30]); } catch { /* */ }
        }
        poll();
      })
      .catch((e) => {
        setVoted((v) => { const n = new Set(v); n.delete(t.key); return n; });
        setHistory((h) => h.filter((k) => k !== t.key));
        setToast((e as Error).message);
      });
  }, [code, member, poll]);

  const undo = useCallback(() => {
    const last = history_[history_.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setVoted((v) => { const n = new Set(v); n.delete(last); return n; });
    pinned.current = last;
    api(`/api/rooms/${code}/unvote`, { method: "POST", body: { member, key: last } }).then(poll).catch((e) => setToast((e as Error).message));
  }, [history_, code, member, poll]);

  const isWatched = (key: string) => watchedLocal[key] ?? !!state?.watched?.[key];
  function markWatched(t: Title, watched: boolean) {
    setWatchedLocal((w) => ({ ...w, [t.key]: watched }));
    api(`/api/rooms/${code}/watched`, { method: "POST", body: { member, key: t.key, watched } })
      .then(() => { setToast(watched ? `“${t.title}” spostato tra i già visti` : `“${t.title}” di nuovo da vedere`); poll(); })
      .catch((e) => { setWatchedLocal((w) => { const n = { ...w }; delete n[t.key]; return n; }); setToast((e as Error).message); });
  }

  async function deleteRoom() {
    try {
      await api(`/api/rooms/${code}/delete`, { method: "POST", body: { member } });
      forgetRoom(code); onExit();
    } catch (e) { setConfirmDelete(false); setToast((e as Error).message); }
  }

  async function leaveRoom() {
    try { await api(`/api/rooms/${code}/leave`, { method: "POST", body: { member } }); } catch { /* esco comunque */ }
    forgetRoom(code); onExit();
  }

  const members = state?.members ?? [{ id: member, name: session.name, seen: voted.size }];
  const matches = [...(state?.matches ?? [])].sort((a, b) => b.at - a.at).map((m) => byKey.get(m.key)).filter((t): t is Title => !!t);
  const toWatch = matches.filter((t) => !isWatched(t.key));
  const nameOf = (id: string) => (id === member ? "te" : members.find((m) => m.id === id)?.name ?? "qualcuno");
  const seenNote = (key: string) => {
    const ids = state?.alreadyBy?.[key] ?? [];
    if (!ids.length) return undefined;
    if (ids.length >= members.length) return "L'avevate già visto tutti";
    return `Già visto da ${ids.map(nameOf).join(" e ")}`;
  };
  // Filtro Tutti / Film / Serie nella lista match: compare solo se la stanza ha film e serie
  const [kind, setKind] = useState<TypeFilter>("all");
  const mixed = meta.filter === "all" || (matches.some((t) => t.type === "movie") && matches.some((t) => t.type === "tv"));
  const shownKind: TypeFilter = mixed ? kind : "all";
  const ofKind = (t: Title) => shownKind === "all" || t.type === shownKind;
  const toWatchShown = toWatch.filter(ofKind);
  const watchedList = matches.filter((t) => isWatched(t.key)).filter(ofKind);
  const kindLabel = shownKind === "movie" ? "film" : shownKind === "tv" ? "serie" : "match";
  const alone = members.length < 2;
  const cur = queue[0];
  const ambient = tab === "swipe" ? cur?.poster ?? toWatch[0]?.poster ?? null : toWatch[0]?.poster ?? matches[0]?.poster ?? null;
  const popupTitle = popups[0] ? byKey.get(popups[0]) : undefined;

  if (gone) {
    return (<>
      <Ambient src={null} />
      <main className="app">
        <div className="glass panel center"><h3>Stanza chiusa</h3><p className="muted">{gone}</p><button className="btn primary" onClick={onExit}>Torna all&apos;inizio</button></div>
      </main>
    </>);
  }

  return (
    <>
      <Ambient src={ambient} />
      <main className="app room">
        <div className={"top sticky-bar" + (scrolled ? " scrolled" : "")}>
          <button className="glass round back" onClick={onExit} aria-label="Torna alle tue stanze (resti nella stanza)" title="Le tue stanze">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <button className="glass pill code-pill" onClick={() => setInvite(true)} aria-label={`${meta.name || "Stanza"} ${code}: invita, cambia stanza o impostazioni`}>
            <span className="muted room-title">{meta.name || "Stanza"}</span> <b>{code}</b>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <div className="segmented two mini icons" role="tablist" aria-label="Vista">
            <button role="tab" aria-selected={tab === "swipe"} aria-checked={tab === "swipe"} onClick={() => setTab("swipe")} aria-label="Swipe" title="Swipe">
              {/* due carte sovrapposte: quella davanti, piena, copre quella dietro */}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
                {/* la carta dietro viene "tagliata" dove c'è quella davanti, così non si vede in trasparenza */}
                <mask id="swipe-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
                  <rect width="24" height="24" fill="#fff" />
                  <rect x="9" y="3.5" width="11" height="15" rx="2.5" transform="rotate(8 14.5 11)" fill="#000" stroke="#000" strokeWidth="3.5" />
                </mask>
                <rect x="3.5" y="5" width="11" height="15" rx="2.5" transform="rotate(-10 9 12.5)" mask="url(#swipe-cut)" />
                <rect x="9" y="3.5" width="11" height="15" rx="2.5" fill="currentColor" transform="rotate(8 14.5 11)" />
              </svg>
            </button>
            <button role="tab" aria-selected={tab === "list"} aria-checked={tab === "list"} onClick={() => setTab("list")}
              aria-label={toWatch.length ? `Match, ${toWatch.length} da vedere` : "Match"} title="Match">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d={HEART} /></svg>
              {toWatch.length ? <span className="badge">{toWatch.length}</span> : null}
            </button>
          </div>
        </div>

        <div className="members" aria-label="Partecipanti">
          {members.map((m) => (
            <span key={m.id} className={"glass member" + (m.id === member ? " me" : "")}>
              <span className="avatar">{m.name.slice(0, 1).toUpperCase()}</span>
              {m.id === member ? "Tu" : m.name}
              <span className="prog">{Math.min(m.id === member ? voted.size : m.seen, deck.length)}/{deck.length}</span>
            </span>
          ))}
        </div>

        {alone && (
          <button className="glass panel invite-banner" onClick={() => setInvite(true)}>
            <span><b>Sei solo nella stanza.</b> <span className="muted">Tocca qui per invitare qualcuno; intanto puoi già votare.</span></span>
          </button>
        )}

        {tab === "swipe" ? (
          cur ? (
            <Swipe key="swipe" queue={queue} paused={!!detail || invite || round || confirmLeave || confirmDelete || popups.length > 0}
              canUndo={history_.length > 0} onVote={vote} onUndo={undo}
              onOpen={(t) => setDetail({ t, canVote: true })} />
          ) : (
            <section className="glass panel center">
              <h3>Hai votato tutto</h3>
              <p className="muted">{alone
                ? "Quando entrerà qualcuno, i titoli che vi piacciono compariranno tra i match."
                : "I match possono ancora arrivare mentre gli altri votano. Se volete altre proposte, fate un nuovo giro: i titoli già votati non tornano."}</p>
              <button className="btn primary" onClick={() => setRound(true)}>Nuovo giro: altri titoli</button>
              <button className="btn" onClick={() => setTab("list")}>Vedi i match ({toWatch.length} da vedere)</button>
            </section>
          )
        ) : (
          <section className="stack-m">
            <div className="headline"><span className="big">{toWatchShown.length}</span><span>{kindLabel} da vedere</span></div>
            {mixed && (
              <div className="segmented kind-filter" role="radiogroup" aria-label="Mostra">
                {(["all", "movie", "tv"] as TypeFilter[]).map((f) => (
                  <button key={f} type="button" role="radio" aria-checked={shownKind === f} onClick={() => setKind(f)}>
                    {f === "all" ? "Tutti" : TYPE_LABEL[f]}
                    <span className="count">{(f === "all" ? toWatch : toWatch.filter((t) => t.type === f)).length}</span>
                  </button>
                ))}
              </div>
            )}
            {toWatchShown.length ? <Grid items={toWatchShown} note={seenNote} onOpen={(t) => setDetail({ t, canVote: false })} /> : (
              <p className="glass panel muted">{
                toWatch.length ? `Nessun${shownKind === "tv" ? "a serie" : " film"} da vedere tra i match: prova “Tutti” o fate un nuovo giro.`
                : matches.length ? "Avete visto tutti i vostri match. Fate un nuovo giro per trovarne altri."
                : "Ancora nessun match. Appena un titolo piace a tutti i presenti comparirà qui, e ve lo segnalo subito."}</p>
            )}
            {watchedList.length > 0 && (<>
              <h3 className="section-title">Già visti <span className="muted">{watchedList.length}</span></h3>
              <Grid items={watchedList} watched note={seenNote} onOpen={(t) => setDetail({ t, canVote: false })} />
            </>)}
            <button className="glass panel round-cta" onClick={() => setRound(true)}>
              <span><b>Nuovo giro</b><span className="muted small">Altri titoli da votare, anche con generi o piattaforme diversi.</span></span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </section>
        )}
        <Footer />
      </main>

      {detail && (
        <Sheet t={detail.t} onClose={() => setDetail(null)}
          onVote={detail.canVote ? (yes, seen) => { const t = detail.t; setDetail(null); vote(t, yes, seen); } : undefined}
          watched={detail.canVote ? undefined : isWatched(detail.t.key)}
          onWatched={detail.canVote ? undefined : (w) => { const t = detail.t; setDetail(null); markWatched(t, w); }}
          note={detail.canVote ? undefined : seenNote(detail.t.key)} />
      )}
      {invite && <Invite code={code} member={member} roomName={meta.name} onClose={() => setInvite(false)} onSwitch={onSwitch}
        onRenamed={(n) => { setMeta((m) => ({ ...m, name: n ?? undefined })); setToast(n ? `Stanza rinominata in “${n}”` : "Nome della stanza tolto"); poll(); }}
        onLeave={() => { setInvite(false); setConfirmLeave(true); }}
        onDelete={() => { setInvite(false); setConfirmDelete(true); }} />}
      {confirmDelete && (
        <Confirm title="Eliminare la stanza per sempre?"
          text={`La stanza${meta.name ? ` “${meta.name}”` : ""} sparirà per tutti i partecipanti, insieme a voti, match e titoli già visti. Non si può annullare.`}
          keep="Annulla" go="Elimina per sempre" onCancel={() => setConfirmDelete(false)} onConfirm={deleteRoom} />
      )}
      {round && (
        <NewRound code={code} member={member} meta={meta} providers={providers} onClose={() => setRound(false)}
          onDone={(r) => { setDeck(r.deck); setMeta(r.meta); setRound(false); setTab("swipe"); setToast(`Aggiunti ${r.added} titoli nuovi`); poll(); }} />
      )}
      {confirmLeave && (
        <Confirm title="Abbandonare la stanza?" text="Non farai più parte della stanza: i tuoi voti verranno cancellati e gli altri potranno fare match senza di te. Se vuoi solo passare a un'altra stanza, usa la freccia in alto: i tuoi voti restano."
          keep="Resta nella stanza" go="Abbandona" onCancel={() => setConfirmLeave(false)} onConfirm={leaveRoom} />
      )}
      {popupTitle && (
        <MatchPopup t={popupTitle} names={members.map((m) => (m.id === member ? "tu" : m.name))}
          onClose={() => setPopups((p) => p.slice(1))}
          onList={() => { setPopups([]); setTab("list"); }} />
      )}
      {toast && <div className="toast glass" role="status">{toast}</div>}
    </>
  );
}

/* ================= Nuovo giro ================= */
function NewRound({ code, member, meta, providers, onClose, onDone }: {
  code: string; member: string; meta: RoomMeta; providers: Provider[];
  onClose: () => void; onDone: (r: { added: number; meta: RoomMeta; deck: Title[] }) => void;
}) {
  const [sel, setSel] = useState<number[]>(meta.providers);
  const [filter, setFilter] = useState<TypeFilter>(meta.filter);
  const [genres, setGenres] = useState<string[]>(meta.genres ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function go() {
    setBusy(true); setError("");
    try {
      onDone(await api(`/api/rooms/${code}/round`, { method: "POST", body: { member, providers: sel, filter, genres: activeGenresFor(genres, filter) } }));
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return (
    <SheetFrame label="Nuovo giro" onClose={onClose}>
      <div className="stack-m">
        <div className="stack-s" style={{ paddingRight: 40 }}>
          <h2>Nuovo giro</h2>
          <p className="muted">Aggiungo titoli che in questa stanza non avete mai visto. Potete cambiare piattaforme e generi per stasera: vale per tutti.</p>
        </div>
        <Filters {...{ providers, sel, setSel, filter, setFilter, genres, setGenres }} />
        {error && <p className="err">{error}</p>}
        <button className="btn primary" onClick={go} disabled={busy || !sel.length}>{busy ? "Cerco titoli nuovi…" : "Aggiungi titoli nuovi"}</button>
      </div>
    </SheetFrame>
  );
}

/* ================= Swipe ================= */
function Swipe({ queue, paused, canUndo, onVote, onUndo, onOpen }: {
  queue: Title[]; paused: boolean; canUndo: boolean;
  onVote: (t: Title, yes: boolean, seen?: boolean) => void; onUndo: () => void; onOpen: (t: Title) => void;
}) {
  const card = useRef<HTMLElement>(null);
  const busy = useRef(false);
  const [ask, setAsk] = useState(false); // domanda "Lo rivedrei / Non lo rivedrei"
  const cur = queue[0], next = queue[1];

  useEffect(() => {
    for (const t of queue.slice(1, 4)) if (t.poster) { new Image().src = t.poster; new Image().src = small(t.poster, "w92")!; }
  }, [queue]);
  useEffect(() => { setAsk(false); }, [cur?.key]);

  const fly = useCallback((yes: boolean, seen = false) => {
    if (busy.current || !cur) return;
    busy.current = true;
    const el = card.current;
    if (el) {
      el.style.transition = "";
      el.style.setProperty(seen ? "--s" : yes ? "--y" : "--n", "1");
      el.style.transform = seen ? "translate(0,-130%) rotate(-4deg)" : `translate(${yes ? 140 : -140}%,-4%) rotate(${yes ? 22 : -22}deg)`;
    }
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => { busy.current = false; onVote(cur, yes, seen); }, reduce ? 0 : 220);
  }, [onVote, cur]);

  const askSeen = useCallback(() => {
    if (busy.current || !cur) return;
    const el = card.current;
    if (el) { el.style.transition = ""; el.style.transform = ""; el.style.setProperty("--y", "0"); el.style.setProperty("--n", "0"); el.style.setProperty("--s", "1"); }
    setAsk(true);
  }, [cur]);
  const cancelAsk = useCallback(() => { card.current?.style.setProperty("--s", "0"); setAsk(false); }, []);
  const choose = (rewatch: boolean) => { setAsk(false); fly(rewatch, true); };

  useEffect(() => {
    if (paused) return;
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea")) return;
      if (ask) { if (e.key === "Escape") cancelAsk(); return; }
      if (e.key === "ArrowRight") fly(true);
      if (e.key === "ArrowLeft") fly(false);
      if (e.key === "ArrowUp") { e.preventDefault(); askSeen(); }
      if ((e.key === "Enter" || e.key === " ") && !(e.target as HTMLElement).closest("button,a")) { e.preventDefault(); onOpen(cur); }
    };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [fly, paused, onOpen, cur, ask, askSeen, cancelAsk]);

  // Trascinamento: destra = mi piace, sinistra = no, su = già visto. Un tocco senza movimento apre la scheda
  useEffect(() => {
    const el = card.current; if (!el || ask) return;
    el.style.transform = ""; ["--y", "--n", "--s"].forEach((v) => el.style.setProperty(v, "0"));
    let sx = 0, sy = 0, dx = 0, dy = 0, on = false;
    const reset = () => { el.style.transform = ""; ["--y", "--n", "--s"].forEach((v) => el.style.setProperty(v, "0")); };
    const up_ = () => -dy > Math.abs(dx) * 1.2; // movimento soprattutto verso l'alto
    const down = (e: PointerEvent) => { if (busy.current) return; on = true; sx = e.clientX; sy = e.clientY; dx = dy = 0; el.setPointerCapture(e.pointerId); el.style.transition = "none"; };
    const move = (e: PointerEvent) => {
      if (!on) return; dx = e.clientX - sx; dy = e.clientY - sy;
      if (up_()) {
        el.style.transform = `translate(${dx * 0.3}px,${dy}px)`;
        el.style.setProperty("--y", "0"); el.style.setProperty("--n", "0");
        el.style.setProperty("--s", String(Math.max(0, Math.min(1, -dy / 100))));
      } else {
        el.style.transform = `translate(${dx}px,${dy * 0.3}px) rotate(${dx / 18}deg)`;
        el.style.setProperty("--s", "0");
        el.style.setProperty("--y", String(Math.max(0, Math.min(1, dx / 100))));
        el.style.setProperty("--n", String(Math.max(0, Math.min(1, -dx / 100))));
      }
    };
    const up = () => {
      if (!on) return; on = false; el.style.transition = "";
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) { reset(); onOpen(cur); return; }
      if (up_() && dy < -100) { askSeen(); return; }
      if (dx > 100) fly(true); else if (dx < -100) fly(false); else reset();
    };
    el.addEventListener("pointerdown", down); el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    return () => { el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); };
  }, [cur, fly, onOpen, ask, askSeen]);

  return (
    <>
      <div className="stack">
        {next && <Card t={next} under key={"u" + next.key} />}
        <Card t={cur} ref={card} key={cur.key} />
        {ask && (
          <div className="seen-ask glass" role="dialog" aria-modal="false" aria-labelledby="seen-q">
            <p id="seen-q"><b>L&apos;hai già visto.</b> Lo rivedresti?</p>
            <div className="row">
              <button className="btn no" onClick={() => choose(false)}>Non lo rivedrei</button>
              <button className="btn yes" onClick={() => choose(true)} autoFocus>Lo rivedrei</button>
            </div>
            <button className="linkbtn" onClick={cancelAsk}>Annulla</button>
          </div>
        )}
      </div>
      <div className="actions">
        <button className="glass round sm" onClick={onUndo} disabled={!canUndo} aria-label="Annulla l'ultimo voto">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></svg>
        </button>
        <button className="glass round n" onClick={() => fly(false)} aria-label="No" disabled={ask}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <button className="glass round y" onClick={() => fly(true)} aria-label="Mi piace" disabled={ask}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d={HEART} /></svg>
        </button>
        <button className="glass round sm s" onClick={askSeen} aria-label="L'ho già visto" title="Già visto" disabled={ask}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
        </button>
      </div>
      <p className="hint">Destra se ti piace, sinistra se no, in alto se l&apos;hai già visto. Tocca la carta per leggere la trama.</p>
    </>
  );
}

function Card({ t, under, ref }: { t: Title; under?: boolean; ref?: React.Ref<HTMLElement> }) {
  const [seenHere, setSeenHere] = useState(false);
  useEffect(() => { setSeenHere(seenMem.has(t.key)); }, [t.key]);
  return (
    <article ref={ref} className={"card" + (under ? " under" : "")} aria-label={t.title}>
      {t.poster ? <img className="poster" src={t.poster} alt="" draggable={false} /> : <div className="poster noposter" />}
      {seenHere && <span className="seen-before">Già visto da te</span>}
      <div className="card-info">
        <div className="meta"><span>{metaLine(t)}</span></div>
        <h2>{t.title}</h2>
        {t.overview && <p className="overview">{t.overview}</p>}
        <div className="card-foot">
          <div className="provs">{t.providers.slice(0, 3).map((p) => <span key={p} className="tag">{p}</span>)}</div>
          <span className="more">Leggi tutto</span>
        </div>
      </div>
      <span className="stamp y">MI PIACE</span><span className="stamp n">NO</span><span className="stamp s">GIÀ VISTO</span>
    </article>
  );
}

/* ================= Popup "È un match!" ================= */
function MatchPopup({ t, names, onClose, onList }: { t: Title; names: string[]; onClose: () => void; onList: () => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    btn.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [onClose]);
  const who = names.length === 2 ? `a te e ${names.find((n) => n !== "tu")}` : `a tutti e ${names.length}`;
  return (
    <div className="match-wrap" role="alertdialog" aria-modal="true" aria-labelledby="m-t">
      {t.poster && <img className="match-bg" src={small(t.poster, "w342")!} alt="" aria-hidden />}
      <div className="match">
        <p className="match-kicker">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d={HEART} /></svg>
          È un match!
        </p>
        {t.poster ? <img className="match-poster" src={small(t.poster, "w342")!} alt="" /> : <span className="match-poster noposter" />}
        <h2 id="m-t">{t.title}</h2>
        <p className="muted">Piace {who}.</p>
        <div className="dialog-actions">
          <button ref={btn} className="btn primary" onClick={onClose}>Continua a votare</button>
          <button className="btn" onClick={onList}>Vedi tutti i match</button>
        </div>
      </div>
    </div>
  );
}

/* ================= Invito ================= */
function Invite({ code, member, roomName, onClose, onLeave, onDelete, onSwitch, onRenamed }: {
  code: string; member: string; roomName?: string; onClose: () => void; onLeave: () => void; onDelete: () => void;
  onSwitch: (code: string) => Promise<void>; onRenamed: (name: string | null) => void;
}) {
  const [newName, setNewName] = useState(roomName ?? "");
  const [saving, setSaving] = useState(false);
  const [renameErr, setRenameErr] = useState("");
  const changed = newName.trim() !== (roomName ?? "");
  async function rename() {
    setSaving(true); setRenameErr("");
    try {
      const r = await api<{ name: string | null }>(`/api/rooms/${code}/rename`, { method: "POST", body: { member, name: newName } });
      setNewName(r.name ?? ""); onRenamed(r.name);
    } catch (e) { setRenameErr((e as Error).message); }
    setSaving(false);
  }
  const [msg, setMsg] = useState("");
  const [others] = useRoomSummaries(code);
  const [switching, setSwitching] = useState(false);
  const [switchErr, setSwitchErr] = useState("");
  async function go(c: string) {
    setSwitching(true); setSwitchErr("");
    try { await onSwitch(c); } catch (e) { setSwitchErr((e as Error).message); setSwitching(false); }
  }
  const link = typeof location !== "undefined" ? `${location.origin}/r/${code}` : "";
  const text = `Scegliamo cosa guardare su Filmetto! Entra nella stanza ${roomName ? `“${roomName}” (${code})` : code}: ${link}`;
  async function share() {
    try { if (navigator.share) { await navigator.share({ title: "Filmetto", text }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(text); setMsg("Invito copiato"); } catch { setMsg("Copia il link qui sotto"); }
  }
  return (
    <SheetFrame label={roomName || `Stanza ${code}`} onClose={onClose}>
      <div className="invite">
        {others.length > 0 && (
          <section className="switcher">
            <span className="lbl">Passa a un&apos;altra stanza</span>
            <RoomRows rooms={others} busy={switching} onOpen={go} />
            {switchErr && <p className="err">{switchErr}</p>}
            <span className="hint-inline">In questa stanza resti dentro con tutti i tuoi voti.</span>
          </section>
        )}
        <form className="rename" onSubmit={(e) => { e.preventDefault(); if (changed) rename(); }}>
          <label className="lbl" htmlFor="rename">Nome della stanza</label>
          <div className="rename-row">
            <input id="rename" type="text" maxLength={40} autoComplete="off" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button className="btn primary" disabled={!changed || saving}>{saving ? "…" : "Salva"}</button>
          </div>
          {renameErr ? <p className="err">{renameErr}</p> : <span className="hint-inline">Lo vedono subito tutti. Lascialo vuoto per togliere il nome.</span>}
        </form>
        <span className="lbl">Invita altre persone</span>
        <div className="code-big" aria-label={code.split("").join(" ")}>{code.split("").map((c, i) => <span key={i}>{c}</span>)}</div>
        <p className="muted">Gli altri aprono il link oppure scrivono il codice in “Ho un codice”. Si può entrare anche a partita iniziata. Dal primo match la stanza resta salvata per sempre: segnatevi il codice per rientrare da qualsiasi telefono.</p>
        <button className="btn primary" onClick={share}>Condividi l&apos;invito</button>
        {msg && <p className="small center">{msg}</p>}
        <input type="text" readOnly value={link} aria-label="Link della stanza" onFocus={(e) => e.currentTarget.select()} className="link-field" />
        <div className="danger-zone">
          <button className="btn danger" onClick={onLeave}>Abbandona la stanza</button>
          <button className="btn danger" onClick={onDelete}>Elimina la stanza per tutti</button>
        </div>
      </div>
    </SheetFrame>
  );
}

/* ================= Conferma ================= */
function Confirm({ title, text, keep, go, onCancel, onConfirm }: {
  title: string; text: string; keep: string; go: string; onCancel: () => void; onConfirm: () => void;
}) {
  const keepBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    keepBtn.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [onCancel]);
  return (
    <div className="dialog-wrap" onClick={onCancel}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="c-t" aria-describedby="c-d" onClick={(e) => e.stopPropagation()}>
        <h3 id="c-t">{title}</h3>
        <p id="c-d" className="muted">{text}</p>
        <div className="dialog-actions">
          <button ref={keepBtn} className="btn primary" onClick={onCancel}>{keep}</button>
          <button className="btn danger" onClick={onConfirm}>{go}</button>
        </div>
      </div>
    </div>
  );
}

/* ================= Fogli dal basso ================= */
function SheetFrame({ label, bg, onClose, children }: { label: string; bg?: string | null; onClose: () => void; children: React.ReactNode }) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeBtn.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", k);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        {bg && <img className="sheet-bg" src={bg} alt="" aria-hidden />}
        <div className="sheet-body">
          <button ref={closeBtn} className="glass round close" onClick={onClose} aria-label="Chiudi">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
          {children}
        </div>
      </div>
    </div>
  );
}

function Sheet({ t, onClose, onVote, watched, onWatched, note }: {
  t: Title; onClose: () => void; onVote?: (yes: boolean, seen?: boolean) => void; watched?: boolean; onWatched?: (w: boolean) => void; note?: string;
}) {
  const [askSeen, setAskSeen] = useState(false);
  return (
    <SheetFrame label={t.title} bg={small(t.poster, "w342")} onClose={onClose}>
      <div className="sheet-head">
        {t.poster ? <img src={small(t.poster, "w342")!} alt="" /> : <span className="noposter" />}
        <div>
          <h2>{t.title}</h2>
          <p className="muted">{metaLine(t)}</p>
          {t.genres.length > 0 && <p className="genre">{t.genres.join(" · ")}</p>}
          {note && <p className="seen-note">{note}</p>}
        </div>
      </div>
      <p className="full">{t.overview || "Nessuna trama disponibile in italiano."}</p>
      {t.providers.length > 0 && (
        <div className="field">
          <span className="lbl">Disponibile su</span>
          <div className="chips">{t.providers.map((p) => <span key={p} className="glass pill">{p}</span>)}</div>
        </div>
      )}
      {onVote ? (
        askSeen ? (
          <div className="seen-inline">
            <p><b>L&apos;hai già visto.</b> Lo rivedresti?</p>
            <div className="row">
              <button className="btn no" onClick={() => onVote(false, true)}>Non lo rivedrei</button>
              <button className="btn yes" onClick={() => onVote(true, true)} autoFocus>Lo rivedrei</button>
            </div>
            <button className="linkbtn" onClick={() => setAskSeen(false)}>Annulla</button>
          </div>
        ) : (
          <div className="vote-btns">
            <div className="row">
              <button className="btn no" onClick={() => onVote(false)}>No</button>
              <button className="btn yes" onClick={() => onVote(true)}>Mi piace</button>
            </div>
            <button className="btn seen-btn" onClick={() => setAskSeen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
              L&apos;ho già visto
            </button>
          </div>
        )
      ) : (<>
        {onWatched && (watched
          ? <button className="btn" onClick={() => onWatched(false)}>Rimetti tra quelli da vedere</button>
          : <button className="btn yes" onClick={() => onWatched(true)}>L&apos;abbiamo visto ✓</button>)}
        <a className="btn primary" href={`https://www.justwatch.com/it/cerca?q=${encodeURIComponent(t.title)}`} target="_blank" rel="noopener">Dove guardarlo</a>
      </>)}
    </SheetFrame>
  );
}

function Grid({ items, onOpen, watched, note }: {
  items: Title[]; onOpen: (t: Title) => void; watched?: boolean; note?: (key: string) => string | undefined;
}) {
  return (
    <ul className={"grid" + (watched ? " watched" : "")}>
      {items.map((t) => (
        <li key={t.key}>
          <button className="tile" onClick={() => onOpen(t)} aria-label={`${t.title}: apri la scheda`}>
            {t.poster ? <img src={small(t.poster, "w342")!} alt="" /> : <span className="noposter" />}
            {watched && <span className="seen-tag">Visto ✓</span>}
            <span className="tile-cap glass">
              <b>{t.title}</b><span>{t.providers[0] ?? metaLine(t)}</span>
              {note?.(t.key) && <span className="seen-note">{note(t.key)}</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
