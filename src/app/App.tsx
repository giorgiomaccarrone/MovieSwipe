"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Provider, Title, TypeFilter } from "@/lib/types";

/* ---------- Tipi delle risposte API ---------- */
interface Session {
  code: string; member: string; name: string;
  meta: { providers: number[]; filter: TypeFilter };
  deck: Title[]; voted: string[]; liked: string[];
}
interface Member { id: string; name: string; seen: number }
interface RoomState { v: number; members: Member[]; counts: Record<string, number>; matches: { key: string; at: number }[] }

/* ---------- Memoria locale (solo comodità: nome, filtri, stanze in cui sono entrato) ---------- */
type RoomsMem = Record<string, { member: string; at: number }>;
const mem = {
  get<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } },
  set(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* non disponibile */ } },
};
const DAY = 24 * 60 * 60 * 1000;
const rememberRoom = (code: string, member: string) => { const r = mem.get<RoomsMem>("pm-rooms", {}); r[code] = { member, at: Date.now() }; mem.set("pm-rooms", r); };
const forgetRoom = (code: string) => { const r = mem.get<RoomsMem>("pm-rooms", {}); delete r[code]; mem.set("pm-rooms", r); };
const lastRoom = (): string | null => {
  const r = mem.get<RoomsMem>("pm-rooms", {});
  const best = Object.entries(r).filter(([, x]) => Date.now() - x.at < DAY).sort((a, b) => b[1].at - a[1].at)[0];
  return best ? best[0] : null;
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

  function enter(s: Session) {
    rememberRoom(s.code, s.member);
    mem.set("pm-name", s.name.replace(/ \d+$/, ""));
    history.replaceState(null, "", `/r/${s.code}`);
    setSession(s); window.scrollTo(0, 0);
  }

  return (
    <>
      {session ? (
        <Room session={session} onExit={() => { setSession(null); history.replaceState(null, "", "/"); }} />
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

/* ================= Home: crea o entra ================= */
function Home({ providers, flags, initialCode, bootError, onEnter }: {
  providers: Provider[]; flags: { demo: boolean; database: boolean }; initialCode?: string; bootError: string;
  onEnter: (s: Session) => void;
}) {
  const [mode, setMode] = useState<"create" | "join">(initialCode ? "join" : "create");
  const [name, setName] = useState("");
  const [sel, setSel] = useState<number[]>([]);
  const [filter, setFilter] = useState<TypeFilter>("all");
  const [code, setCode] = useState(initialCode ?? "");
  const [info, setInfo] = useState<{ members: string[]; meta: { providers: number[]; filter: TypeFilter } } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resume, setResume] = useState<string | null>(null);

  useEffect(() => {
    setName(mem.get("pm-name", ""));
    const prefs = mem.get<{ providers: number[]; filter: TypeFilter } | null>("pm-prefs", null);
    if (prefs) { setSel(prefs.providers); setFilter(prefs.filter); }
    const last = lastRoom(); if (last && last !== initialCode) setResume(last);
  }, [initialCode]);
  useEffect(() => { if (!sel.length && providers.length && !mem.get("pm-prefs", null)) setSel(providers.slice(0, 4).map((p) => p.id)); }, [providers, sel.length]);

  // Anteprima della stanza dell'invito
  const cleanCode = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
  useEffect(() => {
    setInfo(null);
    if (cleanCode.length !== 4) return;
    let alive = true;
    api<{ members: string[]; meta: { providers: number[]; filter: TypeFilter } }>(`/api/rooms/${cleanCode}`)
      .then((d) => alive && (setInfo(d), setError("")))
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [cleanCode]);

  const provName = (id: number) => providers.find((p) => p.id === id)?.name;
  const toggle = (id: number) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);

  async function submit() {
    if (!name.trim()) return setError("Scrivi il tuo nome, così gli altri sanno chi sei.");
    setBusy(true); setError("");
    try {
      if (mode === "create") {
        mem.set("pm-prefs", { providers: sel, filter });
        onEnter(await api<Session>("/api/rooms", { method: "POST", body: { name, providers: sel, filter } }));
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
    catch (e) { forgetRoom(c); setResume(null); setError((e as Error).message); setBusy(false); }
  }

  return (
    <>
      <header className="hero">
        <span className="logo" aria-hidden><svg viewBox="0 0 24 24" fill="currentColor"><path d={HEART} /></svg></span>
        <h1>Popcorn Match</h1>
        <p className="lead">Create una stanza, fate swipe insieme su film e serie. Quando piace a tutti, è un match.</p>
        {flags.demo && <p className="pill warn">Modalità demo: manca la chiave TMDB</p>}
        {!flags.database && <p className="pill warn">Database non collegato: le stanze funzionano solo su questo server</p>}
      </header>

      {resume && (
        <button className="glass panel resume" onClick={() => rejoin(resume)} disabled={busy}>
          <span><span className="lbl">Partita in corso</span><b>Rientra nella stanza {resume}</b></span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      )}

      <form className="glass panel" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div className="segmented two" role="tablist" aria-label="Cosa vuoi fare">
          <button type="button" role="tab" aria-selected={mode === "create"} aria-checked={mode === "create"} onClick={() => { setMode("create"); setError(""); }}>Crea stanza</button>
          <button type="button" role="tab" aria-selected={mode === "join"} aria-checked={mode === "join"} onClick={() => { setMode("join"); setError(""); }}>Ho un codice</button>
        </div>

        <div className="field">
          <label className="lbl" htmlFor="name">Il tuo nome</label>
          <input id="name" type="text" maxLength={16} autoComplete="given-name" autoCapitalize="words" value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        {mode === "create" ? (<>
          <div className="field">
            <span className="lbl">Piattaforme</span>
            <div className="chips">
              {providers.map((p) => (
                <button key={p.id} type="button" className={"chip prov" + (p.logo ? "" : " nologo")} aria-pressed={sel.includes(p.id)} onClick={() => toggle(p.id)}>
                  {p.logo && <img src={p.logo} alt="" width={24} height={24} />}{p.name}
                </button>
              ))}
              {!providers.length && <span className="muted small">{bootError || "Carico le piattaforme…"}</span>}
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
        </>) : (
          <div className="field">
            <label className="lbl" htmlFor="code">Codice della stanza</label>
            <input id="code" type="text" className="code-input" inputMode="text" autoCapitalize="characters" autoComplete="off" maxLength={4}
              value={cleanCode} onChange={(e) => setCode(e.target.value)} />
            {info && (
              <p className="muted small">
                Dentro: <b className="ink">{info.members.join(", ") || "nessuno"}</b> · {TYPE_LABEL[info.meta.filter]} su{" "}
                {info.meta.providers.map(provName).filter(Boolean).join(", ") || "piattaforme scelte"}
              </p>
            )}
          </div>
        )}

        {error && <p className="err">{error}</p>}
        <button className="btn primary" disabled={busy || (mode === "create" ? !sel.length : cleanCode.length !== 4)}>
          {busy ? "Un attimo…" : mode === "create" ? "Crea la stanza" : "Entra nella stanza"}
        </button>
      </form>
    </>
  );
}

/* ================= Stanza ================= */
function Room({ session, onExit }: { session: Session; onExit: () => void }) {
  const { code, member, deck } = session;
  const byKey = useMemo(() => new Map(deck.map((t) => [t.key, t])), [deck]);
  const [voted, setVoted] = useState<Set<string>>(() => new Set(session.voted));
  const [history_, setHistory] = useState<string[]>([]);
  const [state, setState] = useState<RoomState | null>(null);
  const [tab, setTab] = useState<"swipe" | "list">("swipe");
  const [detail, setDetail] = useState<{ t: Title; canVote: boolean } | null>(null);
  const [invite, setInvite] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [popups, setPopups] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [gone, setGone] = useState("");
  const seenMatches = useRef<Set<string> | null>(null);
  const vRef = useRef(0);

  /* --- aggiornamento ogni 2 secondi (solo se la pagina è visibile) --- */
  const poll = useCallback(async () => {
    try {
      const d = await api<RoomState | { v: number; same: true }>(`/api/rooms/${code}/state?v=${vRef.current}`);
      if ("same" in d) return;
      vRef.current = d.v;
      setState(d);
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
    poll();
    const id = setInterval(() => { if (document.visibilityState === "visible") poll(); }, 2000);
    const vis = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", vis); };
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

  const vote = useCallback((t: Title, like: boolean) => {
    setVoted((v) => new Set(v).add(t.key));
    setHistory((h) => [...h, t.key]);
    api<{ match: boolean }>(`/api/rooms/${code}/vote`, { method: "POST", body: { member, key: t.key, like } })
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

  async function leaveRoom() {
    try { await api(`/api/rooms/${code}/leave`, { method: "POST", body: { member } }); } catch { /* esco comunque */ }
    forgetRoom(code); onExit();
  }

  const members = state?.members ?? [{ id: member, name: session.name, seen: voted.size }];
  const matches = [...(state?.matches ?? [])].sort((a, b) => b.at - a.at).map((m) => byKey.get(m.key)).filter((t): t is Title => !!t);
  const alone = members.length < 2;
  const cur = queue[0];
  const ambient = tab === "swipe" ? cur?.poster ?? matches[0]?.poster ?? null : matches[0]?.poster ?? null;
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
        <div className="top">
          <button className="glass pill code-pill" onClick={() => setInvite(true)} aria-label={`Stanza ${code}: invita altre persone`}>
            <span className="muted">Stanza</span> <b>{code}</b>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <div className="segmented two mini" role="tablist" aria-label="Vista">
            <button role="tab" aria-selected={tab === "swipe"} aria-checked={tab === "swipe"} onClick={() => setTab("swipe")}>Swipe</button>
            <button role="tab" aria-selected={tab === "list"} aria-checked={tab === "list"} onClick={() => setTab("list")}>
              Match{matches.length ? <span className="badge">{matches.length}</span> : null}
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
            <Swipe key="swipe" queue={queue} paused={!!detail || invite || confirmLeave || popups.length > 0}
              canUndo={history_.length > 0} onVote={vote} onUndo={undo}
              onOpen={(t) => setDetail({ t, canVote: true })} onList={() => setTab("list")} matchCount={matches.length} />
          ) : (
            <section className="glass panel center">
              <h3>Hai votato tutto</h3>
              <p className="muted">{alone ? "Quando entrerà qualcuno, i titoli che vi piacciono compariranno tra i match." : "I match possono ancora arrivare mentre gli altri votano: te li mostro appena succede."}</p>
              <button className="btn primary" onClick={() => setTab("list")}>Vedi i match ({matches.length})</button>
            </section>
          )
        ) : (
          <section className="stack-m">
            <div className="headline"><span className="big">{matches.length}</span><span>{matches.length === 1 ? "titolo piace a tutti" : "titoli piacciono a tutti"}</span></div>
            {matches.length ? <Grid items={matches} onOpen={(t) => setDetail({ t, canVote: false })} /> : (
              <p className="glass panel muted">Ancora nessun match. Appena un titolo piace a tutti i presenti comparirà qui, e ve lo segnalo subito.</p>
            )}
          </section>
        )}
        <Footer />
      </main>

      {detail && (
        <Sheet t={detail.t} onClose={() => setDetail(null)}
          onVote={detail.canVote ? (yes) => { const t = detail.t; setDetail(null); vote(t, yes); } : undefined} />
      )}
      {invite && <Invite code={code} onClose={() => setInvite(false)} onLeave={() => { setInvite(false); setConfirmLeave(true); }} />}
      {confirmLeave && (
        <Confirm title="Vuoi uscire dalla stanza?" text="I tuoi voti verranno cancellati e gli altri potranno fare match senza di te."
          keep="Resta nella stanza" go="Esci" onCancel={() => setConfirmLeave(false)} onConfirm={leaveRoom} />
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

/* ================= Swipe ================= */
function Swipe({ queue, paused, canUndo, onVote, onUndo, onOpen, onList, matchCount }: {
  queue: Title[]; paused: boolean; canUndo: boolean; matchCount: number;
  onVote: (t: Title, yes: boolean) => void; onUndo: () => void; onOpen: (t: Title) => void; onList: () => void;
}) {
  const card = useRef<HTMLElement>(null);
  const busy = useRef(false);
  const cur = queue[0], next = queue[1];

  useEffect(() => {
    for (const t of queue.slice(1, 4)) if (t.poster) { new Image().src = t.poster; new Image().src = small(t.poster, "w92")!; }
  }, [queue]);

  const fly = useCallback((yes: boolean) => {
    if (busy.current || !cur) return;
    busy.current = true;
    const el = card.current;
    if (el) {
      el.style.transition = "";
      el.style.setProperty(yes ? "--y" : "--n", "1");
      el.style.transform = `translate(${yes ? 140 : -140}%,-4%) rotate(${yes ? 22 : -22}deg)`;
    }
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => { busy.current = false; onVote(cur, yes); }, reduce ? 0 : 220);
  }, [onVote, cur]);

  useEffect(() => {
    if (paused) return;
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea")) return;
      if (e.key === "ArrowRight") fly(true);
      if (e.key === "ArrowLeft") fly(false);
      if ((e.key === "Enter" || e.key === " ") && !(e.target as HTMLElement).closest("button,a")) { e.preventDefault(); onOpen(cur); }
    };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [fly, paused, onOpen, cur]);

  // Trascinamento; un tocco senza movimento apre la scheda
  useEffect(() => {
    const el = card.current; if (!el) return;
    el.style.transform = ""; el.style.setProperty("--y", "0"); el.style.setProperty("--n", "0");
    let sx = 0, sy = 0, dx = 0, dy = 0, on = false;
    const reset = () => { el.style.transform = ""; el.style.setProperty("--y", "0"); el.style.setProperty("--n", "0"); };
    const down = (e: PointerEvent) => { if (busy.current) return; on = true; sx = e.clientX; sy = e.clientY; dx = dy = 0; el.setPointerCapture(e.pointerId); el.style.transition = "none"; };
    const move = (e: PointerEvent) => {
      if (!on) return; dx = e.clientX - sx; dy = e.clientY - sy;
      el.style.transform = `translate(${dx}px,${dy * 0.3}px) rotate(${dx / 18}deg)`;
      el.style.setProperty("--y", String(Math.max(0, Math.min(1, dx / 100))));
      el.style.setProperty("--n", String(Math.max(0, Math.min(1, -dx / 100))));
    };
    const up = () => {
      if (!on) return; on = false; el.style.transition = "";
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) { reset(); onOpen(cur); return; }
      if (dx > 100) fly(true); else if (dx < -100) fly(false); else reset();
    };
    el.addEventListener("pointerdown", down); el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    return () => { el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); };
  }, [cur, fly, onOpen]);

  return (
    <>
      <div className="stack">
        {next && <Card t={next} under key={"u" + next.key} />}
        <Card t={cur} ref={card} key={cur.key} />
      </div>
      <div className="actions">
        <button className="glass round sm" onClick={onUndo} disabled={!canUndo} aria-label="Annulla l'ultimo voto">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></svg>
        </button>
        <button className="glass round n" onClick={() => fly(false)} aria-label="No">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <button className="glass round y" onClick={() => fly(true)} aria-label="Mi piace">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d={HEART} /></svg>
        </button>
        <button className="glass round sm list-btn" onClick={onList} aria-label={`Vedi i match (${matchCount})`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>
          {matchCount > 0 && <span className="badge">{matchCount}</span>}
        </button>
      </div>
      <p className="hint">Scorri a destra se ti piace, a sinistra se no. Tocca la carta per leggere la trama.</p>
    </>
  );
}

function Card({ t, under, ref }: { t: Title; under?: boolean; ref?: React.Ref<HTMLElement> }) {
  return (
    <article ref={ref} className={"card" + (under ? " under" : "")} aria-label={t.title}>
      {t.poster ? <img className="poster" src={t.poster} alt="" draggable={false} /> : <div className="poster noposter" />}
      <div className="card-info">
        <div className="meta"><span>{metaLine(t)}</span></div>
        <h2>{t.title}</h2>
        {t.overview && <p className="overview">{t.overview}</p>}
        <div className="card-foot">
          <div className="provs">{t.providers.slice(0, 3).map((p) => <span key={p} className="tag">{p}</span>)}</div>
          <span className="more">Leggi tutto</span>
        </div>
      </div>
      <span className="stamp y">MI PIACE</span><span className="stamp n">NO</span>
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
function Invite({ code, onClose, onLeave }: { code: string; onClose: () => void; onLeave: () => void }) {
  const [msg, setMsg] = useState("");
  const link = typeof location !== "undefined" ? `${location.origin}/r/${code}` : "";
  const text = `Scegliamo cosa guardare su Popcorn Match! Entra nella stanza ${code}: ${link}`;
  async function share() {
    try { if (navigator.share) { await navigator.share({ title: "Popcorn Match", text }); return; } } catch { return; }
    try { await navigator.clipboard.writeText(text); setMsg("Invito copiato"); } catch { setMsg("Copia il link qui sotto"); }
  }
  return (
    <SheetFrame label="Invita" onClose={onClose}>
      <div className="invite">
        <span className="lbl">Codice della stanza</span>
        <div className="code-big" aria-label={code.split("").join(" ")}>{code.split("").map((c, i) => <span key={i}>{c}</span>)}</div>
        <p className="muted">Gli altri aprono il link oppure scrivono il codice in “Ho un codice”. Si può entrare anche a partita iniziata.</p>
        <button className="btn primary" onClick={share}>Condividi l&apos;invito</button>
        {msg && <p className="small center">{msg}</p>}
        <input type="text" readOnly value={link} aria-label="Link della stanza" onFocus={(e) => e.currentTarget.select()} className="link-field" />
        <button className="btn danger" onClick={onLeave}>Esci dalla stanza</button>
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

function Sheet({ t, onClose, onVote }: { t: Title; onClose: () => void; onVote?: (yes: boolean) => void }) {
  return (
    <SheetFrame label={t.title} bg={small(t.poster, "w342")} onClose={onClose}>
      <div className="sheet-head">
        {t.poster ? <img src={small(t.poster, "w342")!} alt="" /> : <span className="noposter" />}
        <div>
          <h2>{t.title}</h2>
          <p className="muted">{metaLine(t)}</p>
          {t.genres.length > 0 && <p className="genre">{t.genres.join(" · ")}</p>}
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
        <div className="row">
          <button className="btn no" onClick={() => onVote(false)}>No</button>
          <button className="btn yes" onClick={() => onVote(true)}>Mi piace</button>
        </div>
      ) : (
        <a className="btn primary" href={`https://www.justwatch.com/it/cerca?q=${encodeURIComponent(t.title)}`} target="_blank" rel="noopener">Dove guardarlo</a>
      )}
    </SheetFrame>
  );
}

function Grid({ items, onOpen }: { items: Title[]; onOpen: (t: Title) => void }) {
  return (
    <ul className="grid">
      {items.map((t) => (
        <li key={t.key}>
          <button className="tile" onClick={() => onOpen(t)} aria-label={`${t.title}: apri la scheda`}>
            {t.poster ? <img src={small(t.poster, "w342")!} alt="" /> : <span className="noposter" />}
            <span className="tile-cap glass"><b>{t.title}</b><span>{t.providers[0] ?? metaLine(t)}</span></span>
          </button>
        </li>
      ))}
    </ul>
  );
}
