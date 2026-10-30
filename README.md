# Popcorn Match

Tinder per film e serie: ognuno fa swipe dal suo telefono, i titoli che piacciono a tutti finiscono nella lista da guardare. Niente login e niente database: i voti viaggiano nel link condiviso (`/?c=...`).

## Come funziona
1. Chi inizia sceglie le piattaforme (Netflix, Prime Video, RaiPlay…) e se guardare film, serie o tutto, poi fa swipe.
2. Manda il link agli altri. Il link contiene i filtri e i suoi "mi piace" (ID TMDB).
3. Chi apre il link fa swipe sullo stesso tipo di mazzo e vede subito i match; può rimandare il link aggiornato, che contiene i voti di tutti.

## Sviluppo
```bash
npm install
npm run dev        # senza chiave parte in modalità demo con un catalogo di esempio
```
Per i dati veri crea `.env.local` con:
```
TMDB_API_KEY=la_tua_chiave   # "API Key" v3 oppure "Read Access Token" v4
```

## Pubblicazione su Vercel
1. Importa il repository su vercel.com → New Project.
2. In *Environment Variables* aggiungi `TMDB_API_KEY`.
3. Deploy.

## Struttura
- `src/lib/tmdb.ts` – chiamate a TMDB lato server (la chiave non arriva mai al browser), cache 6 ore
- `src/lib/code.ts` – formato del codice condiviso nel link
- `src/lib/demo.ts` – catalogo di esempio
- `src/app/api/*` – `providers`, `deck`, `details`
- `src/app/App.tsx` – interfaccia (avvio, swipe, risultati)

Dati da [TMDB](https://www.themoviedb.org), disponibilità streaming da JustWatch. Questo prodotto usa l'API di TMDB ma non è approvato né certificato da TMDB.
