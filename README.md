# Filmetto

Tinder per film e serie, senza login. Si crea una stanza, si condivide il codice di 4 lettere e tutti fanno swipe insieme: quando un titolo piace a tutti i presenti, il match compare subito sui telefoni di tutti.

## Come funziona
1. Chi crea la stanza sceglie le piattaforme (Netflix, Prime Video, RaiPlay…) e film/serie/tutto. Il mazzo è uguale per tutti.
2. Gli altri entrano dal link `/r/CODICE` o scrivendo il codice. Si può entrare anche a partita iniziata.
3. I titoli che piacciono già a qualcuno vengono anticipati nel mazzo degli altri, così i match arrivano prima.
4. L'app controlla la stanza ogni 3 secondi mentre si vota e ogni 12 quando nessuno tocca il telefono (una sola lettura se non è cambiato niente).
6. Le stanze restano attive 30 giorni dall'ultimo accesso: i match si segnano come "visti", e con "Nuovo giro" si aggiungono titoli mai proposti (anche con filtri diversi).
7. In home "Le tue stanze" elenca le stanze del telefono; da un telefono nuovo si rientra con "Eri già dentro? Tocca il tuo nome".
5. Ogni telefono riceve un ID anonimo salvato nel browser: ricaricando la pagina si rientra con i propri voti.

## Sviluppo
```bash
npm install
npm run dev        # senza chiave parte in modalità demo con un catalogo di esempio
```
Senza database le stanze vivono nella memoria del server (va bene solo in locale). Per i dati veri crea `.env.local` con:
```
TMDB_API_KEY=la_tua_chiave   # "API Key" v3 oppure "Read Access Token" v4
KV_REST_API_URL=...          # da Vercel → Storage → Upstash Redis (oppure UPSTASH_REDIS_REST_URL)
KV_REST_API_TOKEN=...        # (oppure UPSTASH_REDIS_REST_TOKEN)
```

## Pubblicazione su Vercel
1. Importa il repository su vercel.com → New Project.
2. In *Environment Variables* aggiungi `TMDB_API_KEY`.
3. In *Storage* crea un database Upstash Redis e collegalo al progetto (le variabili si aggiungono da sole).
4. Deploy.

## Struttura
- `src/lib/tmdb.ts` – chiamate a TMDB lato server (la chiave non arriva mai al browser), cache 6 ore
- `src/lib/rooms.ts` – logica delle stanze (crea, entra, vota, annulla, esci, stato, match)
- `src/lib/kv.ts` – accesso a Upstash Redis, con ripiego in memoria per lo sviluppo
- `src/lib/demo.ts` – catalogo di esempio
- `src/app/api/rooms/*` – API delle stanze; `src/app/api/providers` – piattaforme
- `src/app/App.tsx` – interfaccia (home, stanza, swipe, popup match, invito)

Dati da [TMDB](https://www.themoviedb.org), disponibilità streaming da JustWatch. Questo prodotto usa l'API di TMDB ma non è approvato né certificato da TMDB.
