"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cleanName, decode, encode, type Person } from "@/lib/code";
import type { Provider, Title, TypeFilter } from "@/lib/types";

type Screen = "start" | "loading" | "swipe" | "done";
interface Saved { name: string; providers: number[]; filter: TypeFilter; likes: string[] }
interface Detail { t: Title; canVote: boolean }

const store = {
  get(): Saved | null { try { return JSON.parse(localStorage.getItem("pm-last") || "null"); } catch { return null; } },
  set(v: Saved) { try { localStorage.setItem("pm-last", JSON.stringify(v)); } catch { /* storage non disponibile */ } },
};
const sameSet = (a: number[], b: number[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
const TYPE_LABEL: Record<TypeFilter, string> = { all: "Tutto", movie: "Film", tv: "Serie" };
const small = (url: string | null, size = "w185") => (url ? url.replace("/w500/", `/${size}/`) : null);
const metaLine = (t: Title) =>
  [t.type === "movie" ? "Film" : "Serie", t.year, t.rating ? `★ ${t.rating.toFixed(1)}` : null].filter(Boolean).join(" · ");

export default function App() {
  const [screen, setScreen] = useState<Screen>("start");
  const [providers, setProviders] = useState<Provider[]>([]);
  const [demo, setDemo] = useState(false);
  const [sel, setSel] = useState<number[]>([]);
  const [filter, setFilter] = useState<TypeFilter>("all");
  const [name, setName] = useState("");
  const [others, setOthers] = useState<Person[]>([]);
  const [deck, setDeck] = useState<Title[]>([]);
  const [pos, setPos] = useState(0);
  const [likes, setLikes] = useState<string[]>([]);
  const [cache, setCache] = useState<Record<string, Title>>({});
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [backdrop, setBackdrop] = useState<string | null>(null);

  const invited = others.length > 0;

  const remember = useCallback((items: Title[]) => {
    setCache((c) => { const n = { ...c }; for (const t of items) n[t.key] = t; return n; });
  }, []);

  /* Apre un codice ricevuto (link ?c= oppure incollato) */
  const openCode = useCallback((text: string): boolean => {
    const s = decode(text);
    if (!s) return false;
    const mine = store.get();
    setSel(s.providers); setFilter(s.filter); setError("");
    const me = s.people.find((p) => mine && p.name.toLowerCase() === mine.name.toLowerCase());
    if (me) {
      setName(me.name); setLikes(me.likes);
      setOthers(s.people.filter((p) => p !== me));
      setScreen("done");
    } else {
      setOthers(s.people); setScreen("start");
    }
    window.scrollTo(0, 0);
    return true;
  }, []);

  useEffect(() => {
    const s = store.get();
    setSaved(s);
    if (s) { setName(s.name); setSel(s.providers); setFilter(s.filter); }
    fetch("/api/providers").then((r) => r.json()).then((d) => {
      if (d.error) return setError(d.error);
      setProviders(d.providers); setDemo(d.demo);
      if (!s) setSel(d.providers.slice(0, 4).map((p: Provider) => p.id));
    }).catch(() => setError("Connessione non riuscita. Ricarica la pagina."));
    const c = new URLSearchParams(location.search).get("c");
    if (c) openCode(c);
  }, [openCode]);

  async function start() {
    const n = cleanName(name);
    if (!n) return setError("Scrivi il tuo nome (solo lettere e numeri), così gli altri sanno chi ha votato.");
    let unique = n, k = 2;
    while (others.some((p) => p.name.toLowerCase() === unique.toLowerCase())) unique = n + k++;
    setName(unique); setError(""); setScreen("loading");
    try {
      const r = await fetch(`/api/deck?p=${sel.join(",")}&t=${filter}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (!d.items.length) throw new Error("Nessun titolo trovato con questi filtri: prova ad aggiungere piattaforme.");
      const items: Title[] = [...d.items];
      for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
      remember(items); setDeck(items); setPos(0); setLikes([]); setScreen("swipe");
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Non riesco a caricare i titoli."); setScreen("start");
    }
  }

  const finish = useCallback((finalLikes: string[]) => {
    const s: Saved = { name, providers: sel, filter, likes: finalLikes };
    store.set(s); setSaved(s); setScreen("done"); window.scrollTo(0, 0);
  }, [name, sel, filter]);

  const vote = useCallback((yes: boolean) => {
    const t = deck[pos]; if (!t) return;
    const next = yes ? [...likes, t.key] : likes;
    setLikes(next);
    if (pos + 1 >= deck.length) finish(next); else setPos(pos + 1);
  }, [deck, pos, likes, finish]);

  const undo = () => {
    if (pos === 0) return;
    const prev = deck[pos - 1];
    setLikes((l) => l.filter((k) => k !== prev.key)); setPos(pos - 1);
  };

  // Sfondo: i colori della locandina in primo piano, sfocati
  const ambient = screen === "swipe" ? deck[pos]?.poster ?? null : screen === "done" ? backdrop : null;

  return (
    <>
      <Ambient src={ambient} />
      <main className="app">
        {screen === "start" && (
          <Start {...{ providers, demo, sel, setSel, filter, setFilter, name, setName, others, invited, error, saved }}
            onStart={start} onCode={(t) => openCode(t) || (setError("Codice non valido: copia tutto il messaggio ricevuto e riprova."), false)}
            onReuse={() => { if (saved) { setName(saved.name); setLikes(saved.likes); setScreen("done"); } }}
            onReset={() => { setOthers([]); history.replaceState(null, "", "/"); }} />
        )}
        {screen === "loading" && <div className="loading"><span className="spinner" />Preparo il mazzo…</div>}
        {screen === "swipe" && deck[pos] && (
          <Swipe name={name} deck={deck} pos={pos} paused={!!detail} onVote={vote} onUndo={undo}
            onStop={() => finish(likes)} onOpen={(t) => setDetail({ t, canVote: true })} />
        )}
        {screen === "done" && (
          <Done {...{ name, likes, others, sel, filter, cache, remember }}
            onBackdrop={setBackdrop}
            onOpen={(t) => setDetail({ t, canVote: false })}
            onCode={(t) => openCode(t)}
            onAgain={() => { setOthers([]); setScreen("start"); history.replaceState(null, "", "/"); }} />
        )}
        <footer className="note">
          Dati di film e serie da <a href="https://www.themoviedb.org" target="_blank" rel="noopener">TMDB</a>, disponibilità
          streaming da <a href="https://www.justwatch.com/it" target="_blank" rel="noopener">JustWatch</a>. Questo prodotto usa
          l&apos;API di TMDB ma non è approvato né certificato da TMDB.
        </footer>
      </main>
      {detail && (
        <Sheet t={detail.t} onClose={() => setDetail(null)}
          onVote={detail.canVote ? (yes) => { setDetail(null); vote(yes); } : undefined} />
      )}
    </>
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

/* ================= Schermata iniziale ================= */
function Start(props: {
  providers: Provider[]; demo: boolean; sel: number[]; setSel: (v: number[]) => void;
  filter: TypeFilter; setFilter: (f: TypeFilter) => void; name: string; setName: (n: string) => void;
  others: Person[]; invited: boolean; error: string; saved: Saved | null;
  onStart: () => void; onCode: (t: string) => boolean; onReuse: () => void; onReset: () => void;
}) {
  const { providers, demo, sel, setSel, filter, setFilter, name, setName, others, invited, error, saved } = props;
  const [code, setCode] = useState("");
  const canReuse = invited && saved && sameSet(saved.providers, sel) && saved.filter === filter &&
    !others.some((p) => p.name.toLowerCase() === saved.name.toLowerCase());
  const toggle = (id: number) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);

  return (
    <>
      <header className="hero">
        <span className="logo" aria-hidden>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.5h2c.7-1.3 2.2-2.5 4.3-2.5 3.7 0 5.8 3.8 4.3 7.2C19.5 16.4 12 21 12 21z" /></svg>
        </span>
        <h1>Popcorn Match</h1>
        {invited ? (
          <p className="lead"><b>{others.map((p) => p.name).join(", ")}</b> {others.length > 1 ? "hanno" : "ha"} già votato.
            Fai swipe anche tu: i titoli che piacciono a tutti diventano la vostra lista.</p>
        ) : (
          <p className="lead">Fate swipe su film e serie, ognuno dal suo telefono. Quello che piace a tutti finisce nella lista da guardare.</p>
        )}
        {demo && <p className="pill warn">Modalità demo: manca la chiave TMDB</p>}
      </header>

      <form className="glass panel" onSubmit={(e) => { e.preventDefault(); props.onStart(); }}>
        <div className="field">
          <label className="lbl" htmlFor="name">Il tuo nome</label>
          <input id="name" type="text" maxLength={16} autoComplete="given-name" autoCapitalize="words"
            value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <span className="lbl">Piattaforme{invited ? " scelte da chi ha iniziato" : ""}</span>
          <div className="chips">
            {providers.filter((p) => !invited || sel.includes(p.id)).map((p) => (
              <button key={p.id} type="button" className={"chip prov" + (p.logo ? "" : " nologo")} aria-pressed={sel.includes(p.id)} disabled={invited} onClick={() => toggle(p.id)}>
                {p.logo && <img src={p.logo} alt="" width={24} height={24} />}{p.name}
              </button>
            ))}
            {!providers.length && <span className="muted small">Carico le piattaforme…</span>}
          </div>
        </div>
        <div className="field">
          <span className="lbl">Cosa guardate</span>
          <div className="segmented" role="radiogroup" aria-label="Cosa guardate">
            {(["all", "movie", "tv"] as TypeFilter[]).map((f) => (
              <button key={f} type="button" role="radio" aria-checked={filter === f} disabled={invited} onClick={() => setFilter(f)}>{TYPE_LABEL[f]}</button>
            ))}
          </div>
        </div>
        {error && <p className="err">{error}</p>}
        <button className="btn primary" disabled={!sel.length}>Inizia lo swipe</button>
        {canReuse && <button type="button" className="btn" onClick={props.onReuse}>Ho già votato come {saved!.name}: vedi i match</button>}
      </form>

      {invited ? (
        <button type="button" className="linkbtn" onClick={props.onReset}>Ignora l&apos;invito e inizia una nuova partita</button>
      ) : (
        <section className="glass panel">
          <div className="field">
            <label className="lbl" htmlFor="code">Hai ricevuto un link?</label>
            <textarea id="code" rows={2} placeholder="Incollalo qui" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <button type="button" className="btn" onClick={() => props.onCode(code)}>Apri</button>
        </section>
      )}
    </>
  );
}

/* ================= Swipe ================= */
function Swipe({ name, deck, pos, paused, onVote, onUndo, onStop, onOpen }: {
  name: string; deck: Title[]; pos: number; paused: boolean;
  onVote: (yes: boolean) => void; onUndo: () => void; onStop: () => void; onOpen: (t: Title) => void;
}) {
  const card = useRef<HTMLElement>(null);
  const busy = useRef(false);
  const cur = deck[pos], next = deck[pos + 1];

  // Precarico le prossime locandine
  useEffect(() => {
    for (const t of deck.slice(pos + 1, pos + 4)) if (t.poster) { new Image().src = t.poster; new Image().src = small(t.poster, "w92")!; }
  }, [deck, pos]);

  const fly = useCallback((yes: boolean) => {
    if (busy.current) return;
    busy.current = true;
    const el = card.current;
    if (el) {
      el.style.transition = "";
      el.style.setProperty(yes ? "--y" : "--n", "1");
      el.style.transform = `translate(${yes ? 140 : -140}%,-4%) rotate(${yes ? 22 : -22}deg)`;
    }
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(() => { busy.current = false; onVote(yes); }, reduce ? 0 : 220);
  }, [onVote]);

  useEffect(() => {
    if (paused) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") fly(true);
      if (e.key === "ArrowLeft") fly(false);
      if ((e.key === "Enter" || e.key === " ") && !(e.target as HTMLElement).closest("button,a,input,textarea")) { e.preventDefault(); onOpen(cur); }
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
      <div className="top">
        <span className="hello">Ciao {name}</span>
        <span className="glass pill progress">{pos + 1} di {deck.length}</span>
      </div>
      <div className="stack">
        {next && <Card t={next} under />}
        <Card t={cur} ref={card} key={cur.key} />
      </div>
      <div className="actions">
        <button className="glass round sm" onClick={onUndo} disabled={pos === 0} aria-label="Annulla l'ultimo voto">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></svg>
        </button>
        <button className="glass round n" onClick={() => fly(false)} aria-label="No">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        <button className="glass round y" onClick={() => fly(true)} aria-label="Mi piace">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.5h2c.7-1.3 2.2-2.5 4.3-2.5 3.7 0 5.8 3.8 4.3 7.2C19.5 16.4 12 21 12 21z" /></svg>
        </button>
        <button className="glass round sm" onClick={onStop} aria-label="Ho finito, vedi il risultato">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
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
        <div className="meta">
          <span>{metaLine(t)}</span>
        </div>
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

/* ================= Scheda dettaglio ================= */
function Sheet({ t, onClose, onVote }: { t: Title; onClose: () => void; onVote?: (yes: boolean) => void }) {
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
      <div className="sheet" role="dialog" aria-modal="true" aria-label={t.title} onClick={(e) => e.stopPropagation()}>
        {t.poster && <img className="sheet-bg" src={small(t.poster, "w342")!} alt="" aria-hidden />}
        <div className="sheet-body">
          <button ref={closeBtn} className="glass round close" onClick={onClose} aria-label="Chiudi">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
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
        </div>
      </div>
    </div>
  );
}

/* ================= Risultati e condivisione ================= */
function Done({ name, likes, others, sel, filter, cache, remember, onBackdrop, onOpen, onCode, onAgain }: {
  name: string; likes: string[]; others: Person[]; sel: number[]; filter: TypeFilter;
  cache: Record<string, Title>; remember: (t: Title[]) => void; onBackdrop: (src: string | null) => void;
  onOpen: (t: Title) => void; onCode: (t: string) => boolean; onAgain: () => void;
}) {
  const people = useMemo(() => [...others, { name, likes }], [others, name, likes]);
  const code = encode({ providers: sel, filter, people });
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState("");
  const [paste, setPaste] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { setOrigin(location.origin); history.replaceState(null, "", `/?c=${code}`); }, [code]);

  const total = people.length;
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of people) for (const k of new Set(p.likes)) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  }, [people]);
  const matches = others.length ? [...counts].filter(([, c]) => c === total).map(([k]) => k) : [];
  const almost = total >= 3 ? [...counts].filter(([, c]) => c === total - 1).map(([k]) => k) : [];

  // Recupero i dettagli dei titoli che non ho nel mazzo (es. quando apro la risposta di un amico)
  const missingKey = [...matches, ...almost].filter((k) => !cache[k]).join(",");
  useEffect(() => {
    if (!missingKey) return;
    fetch(`/api/details?k=${missingKey}`).then((r) => r.json()).then((d) => d.items && remember(d.items)).catch(() => {});
  }, [missingKey, remember]);

  const firstPoster = matches.map((k) => cache[k]?.poster).find(Boolean) ?? null;
  useEffect(() => { onBackdrop(firstPoster); }, [firstPoster, onBackdrop]);

  const link = `${origin}/?c=${code}`;
  const msg = others.length
    ? `Ecco la nostra lista su Popcorn Match: ${link}`
    : `Facciamo match su cosa guardare! Fai swipe qui: ${link}`;

  async function share() {
    try {
      if (navigator.share) { await navigator.share({ title: "Popcorn Match", text: msg }); return; }
    } catch { return; /* condivisione annullata */ }
    try { await navigator.clipboard.writeText(msg); setCopied("Link copiato"); }
    catch { setCopied("Seleziona il testo qui sopra e copialo"); }
  }

  return (
    <>
      <header className="hero left">
        <h1>{others.length ? "La vostra lista" : `Fatto, ${name}`}</h1>
        <p className="lead">Hai messo mi piace a {likes.length} titoli.</p>
      </header>

      {others.length > 0 && (
        <section className="stack-m">
          <div className="chips">{people.map((p) => <span key={p.name} className="glass pill">{p.name}</span>)}</div>
          <div className="headline"><span className="big">{matches.length}</span><span>{matches.length === 1 ? "titolo piace a tutti" : "titoli piacciono a tutti"}</span></div>
          {matches.length ? <Grid keys={matches} cache={cache} onOpen={onOpen} /> :
            <p className="glass panel muted">Nessun titolo piace a tutti. Provate a rifare lo swipe con più piattaforme o con “Tutto”.</p>}
          {almost.length > 0 && (<>
            <h3>Quasi match</h3><p className="muted small">Piacciono a tutti tranne una persona.</p>
            <Grid keys={almost} cache={cache} onOpen={onOpen} />
          </>)}
        </section>
      )}

      <section className="glass panel">
        <h3>{others.length ? "Manda la lista agli altri" : "Ora tocca agli altri"}</h3>
        <p className="muted small">{others.length
          ? "Il link contiene i voti di tutti: chi lo apre vede gli stessi match. Se manca ancora qualcuno, mandalo a lui."
          : "Manda il link a chi guarda con te, anche in un gruppo. Chi vota dopo vede i match e può rimandarteli."}</p>
        <button className="btn primary" onClick={share}>Condividi il link</button>
        {copied && <p className="small center">{copied}</p>}
        <textarea readOnly rows={2} value={link} aria-label="Link da condividere" onFocus={(e) => e.currentTarget.select()} />
      </section>

      <section className="glass panel">
        <div className="field">
          <label className="lbl" htmlFor="paste">Ti hanno risposto?</label>
          <textarea id="paste" rows={2} placeholder="Apri il loro link oppure incollalo qui" value={paste} onChange={(e) => setPaste(e.target.value)} />
        </div>
        {err && <p className="err">{err}</p>}
        <button type="button" className="btn" onClick={() => { if (!onCode(paste)) setErr("Link non valido: copia tutto il messaggio ricevuto e riprova."); }}>Vedi i match</button>
      </section>
      <button type="button" className="linkbtn" onClick={onAgain}>Nuova partita</button>
    </>
  );
}

function Grid({ keys, cache, onOpen }: { keys: string[]; cache: Record<string, Title>; onOpen: (t: Title) => void }) {
  return (
    <ul className="grid">
      {keys.map((k) => {
        const t = cache[k];
        return (
          <li key={k}>
            <button className="tile" onClick={() => t && onOpen(t)} disabled={!t} aria-label={t ? `${t.title}: apri la scheda` : "Caricamento"}>
              {t?.poster ? <img src={small(t.poster, "w342")!} alt="" /> : <span className="noposter" />}
              <span className="tile-cap glass">
                <b>{t?.title ?? "…"}</b>
                {t && <span>{t.providers[0] ?? metaLine(t)}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
