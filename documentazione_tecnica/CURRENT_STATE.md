# CURRENT_STATE — Audit della v3.0 (P0)

Audit eseguito il 2026-10-03 sullo ZIP `Il_Secchione_ARTE_ROMANA_v3.0.zip` (72 file, 26,4 MB).
Lo ZIP originale non è stato modificato. Tutte le verifiche sono state fatte leggendo il codice
e con script (hash SHA-256, conteggi, confronto dati).

## 1. Struttura v3

| File | Dimensione | Ruolo |
|---|---|---|
| `index.html` | 13,7 KB | Regia (unico HTML dell'app) |
| `js/app.js` | 76,5 KB | Tutta la logica di regia, palco, giochi, editor (328 righe molto lunghe) |
| `js/core.js` | 7,8 KB | Utility pure (shuffle, rankPoints, scoreOutcome, puzzle, catena…) |
| `js/packs.js` | 47,5 KB | Dati del pack `romana` (domande + giochi) in un'unica riga JS |
| `css/show.css` | 30 KB | Tutto lo stile |
| `domande_romana.json` | 47 KB | Copia identica di `packs.js → questions` (verificato byte per byte) |
| `giochi_romana.json` | 9,9 KB | Copia identica di Indovina/Ghigliottina/Catena da `packs.js` (non contiene Photopuzzle e Abbinamenti) |
| `SOLUZIONI_DOCENTE.html` | 16 KB | Elenco soluzioni stampabile |
| `LEGGIMI.txt` | 5,8 KB | Istruzioni |
| `AVVIA_IL_SECCHIONE.bat` | 46 B | `start index.html` |
| `assets/` | ~22,7 MB | logo, 12 PNG mascotte, 23 WAV |
| `immagini/romana/` | ~3,4 MB | 24 JPG |

Dipendenze esterne: **nessuna** (nessuna CDN, nessun font remoto, nessun `fetch`). Funziona da `file://`.
Il doppio schermo usa `window.open('')` + `document.write` e sincronizza il palco scrivendo direttamente
nel DOM della seconda finestra (stessa origine).

Contenuti verificati: 72 domande (tutte `type: mcq`, tutte `seconds: 30`, tutte `correct: "A"`, le
alternative vengono mescolate a runtime), 33 manche (14 Photopuzzle, 8 Indovina, 3 Abbinamenti,
4 Ghigliottine, 4 Catene). I conteggi della specifica sono corretti.

## 2. Verifica dei problemi segnalati nella specifica

| # | Problema | Esito | Dettaglio nel codice v3 |
|---|---|---|---|
| 4.1 | Timer fittizio | **CONFERMATO** | `resetTimer(30)` ×6 (`goQuestion`, `startQuestion`, `loadArcadePreset`, `startPhoto`, `startGh`, finale Ghigliottina); `seconds:30` forzato ×7 (`validateBank`, `saveQuestionFromDialog`, `validateGame`, `applyMatchEditor`, …); campo "Secondi" dell'editor `readonly min=30 max=30`; toast "30 secondi terminati"; Photopuzzle con `revealed=30` fisso; `a.seconds\|\|45` irraggiungibile. |
| 4.2 | Scoring duplicato | **CONFERMATO** | `core.js` ha `rankPoints()`/`scoreOutcome()` ma `app.js` non li usa mai. Calcoli autonomi `300-25*…` in `previewScore()`, `renderScoreOrder()`, `queueHTML()`. La costante `SCORE` in `app.js` è definita e mai letta. |
| 4.3 | Astensione = errata (−100) | **CONFERMATO** | `previewScore`: `outcome==='wrong'\|\|outcome==='abstain' ? -100`. Nel registro (`ledger`) si salvano solo i punti, non la risposta scelta né il tempo. |
| 4.4 | Sessione non ripristinabile | **CONFERMATO** | `localStorage` contiene solo preferenze, archivio domande e giochi personalizzati. Squadre, punteggi e partita sono solo in memoria. |
| 4.5 | Asset duplicati | **CONFERMATO** | 12 PNG mascotte = **2 contenuti distinti** (hash `d52ffb…` ×7, `fc78b7…` ×5), sono la stessa figura specchiata, 941×1670 px, ~1,1 MB l'una (13,3 MB totali). 4 nomi (`idle`, `jump`, `scholar`, `walk`) non sono mai referenziati. Anche `logo.png` (772 KB) e `logo_clean.png` (361 KB) non sono referenziati. `immagini/romana/cesare.jpg` non è usata da nessuna domanda o manche. 23 WAV = 8,3 MB. |
| 4.6 | README incoerente | **CONFERMATO** | `LEGGIMI.txt` cita `Il_Secchione_ARTE_ROMANA_OFFLINE_v3.html`, assente nello ZIP. |

## 3. Assunzioni della specifica da correggere

1. **"assegna manualmente esatto/errato/astensione".** Per le domande a scelta multipla la v3 ha già, nella
   scheda PUNTI, i pulsanti `A B C D —` per ogni squadra, e l'esito viene dedotto dalla lettera. Il tempo si
   perde altrove:
   - si passa dalla scheda DOMANDA alla scheda PUNTI;
   - si inserisce solo dopo la chiusura del tempo;
   - **l'ordine dei clic decide i punti** (300/275/…), quindi bisogna cliccare nell'ordine giusto;
   - non c'è tastiera;
   - le card occupano circa 70 px a squadra e dentro il pannello (alto al massimo `100vh-285px`) bisogna scorrere;
   - serve un clic su CONFERMA.

   Per i giochi arcade c'è davvero il flusso GIUSTA/ERRATA/AST.
2. **"Il server deve essere l'unica fonte per il punteggio".** L'HOST è il PC del docente, cioè un soggetto fidato.
   Il server è autoritativo verso i dispositivi: stato del round, accettazione, timestamp, ordine e soluzione.
   Il punteggio è una funzione pura (`js/engine/scoring.js`) dei record grezzi. Con il server attivo lo calcola
   il server e l'HOST adotta il risultato. Senza server (modalità manuale) lo calcola la stessa funzione nel
   browser. Vedi `ARCHITECTURE.md`.
3. **Bonus Indovina.** `core.js` contiene `IND_BONUS` e `app.js` calcola `arcadeScoreBonus()`, ma
   `previewScore(id,value)` ignora il terzo parametro: **nessun bonus è mai stato applicato**, come dice il
   LEGGIMI. Il codice è morto e in v3.5 non viene riattivato.
4. **"Doppio schermo" come client separato.** Oggi il palco è una finestra figlia scritta via DOM: funziona solo
   sullo stesso PC. `/show` come client indipendente è una migrazione e la finestra classica resta il percorso
   principale.
5. **Node.js.** Sul PC di sviluppo usato per questo lavoro Node non è installato nel PATH: erano disponibili il
   `node.exe` 8.16 incluso in Adobe CC e un Node 24.21 di un'altra applicazione. Server, strumenti e test sono
   quindi scritti **senza dipendenze npm** e compatibili con Node ≥ 8, e sono stati eseguiti con entrambe le
   versioni (vedi `CHANGELOG_V3_5.md`). Sul PC della scuola va installato Node LTS (vedi `NETWORK_SETUP.md`).

## 4. Codice morto / incoerenze trovate

- `#packSelect` è un `<input type=hidden>`: `renderPackSelect()` gli scrive `<option>` e l'evento `change` non
  scatta mai, quindi `switchPack()` è irraggiungibile.
- `recordReceipt()`, il listener `[data-receipt]` e `state.receipts/receiptOrder`: nessun elemento genera
  `data-receipt`, quindi è codice morto.
- `state.scoringMode` vale `'ordine'` ma il codice confronta con `'show'`: il contatore `abstentions` non cresce mai.
- `state.roundRanks`, `state.pendingBonus` (sempre 0), `SCORE`, `IND_BONUS`/`arcadeScoreBonus` non hanno effetto.
- `pauseTimer()` funziona solo se `state.arcade.played`, quindi **le domande non si possono mettere in pausa**.
- `startMatching()` usa `a.seconds||45` ma `a.seconds` è già forzato a 30.
- `sourceHTML()` scrive "slide N (posizione nel file)", mentre LEGGIMI e SOLUZIONI parlano di "pagina".
- Testi "ARTE ROMANA", "Repubblica e Impero", "partita_romana.json", chiave `il-secchione-romana-v30`
  sono cablati in `app.js`/`index.html` invece di venire dal pack.
- `exportSession()` salva `teams+ledger`: il ledger contiene solo `{value, qid, teamId, points}`, senza tempo,
  testo della risposta o modalità di input.

## 5. Cosa funziona bene e va preservato

- Palco scenografico 16:9 con container queries, mascotte animata, transizioni, audio.
- Cinque giochi arcade con editor (Indovina, Ghigliottina, Catena), import/export giochi e domande.
- Doppio schermo con spostamento automatico sul secondo monitor (`getScreenDetails`).
- Funzionamento da `file://` senza server, che diventa il fallback manuale della v3.5.

## 6. Piano sintetico P0–P6

| Fase | Contenuto | Gate |
|---|---|---|
| P0 | Questo audit | — |
| P1 | Timer reale da dati; `scoring.js` unico con profili `legacy_v3`, `show_standard`, `learning`; record grezzi; `SessionStore` con autosave/resume; dedup mascotte; documentazione coerente | test scoring/timer/persistence verdi; i 5 giochi arcade si avviano |
| P2 | Griglia `A B C D Ø` nella scheda DOMANDA, tastiera con avanzamento automatico, Invio = conferma, riordino corrette, `inputMode=manual` / `responseTimeMs=null` | prova browser: 6 squadre registrate con 7 tasti |
| P3 | Server Node senza dipendenze (HTTP + WebSocket), `/host` `/player` `/show`, PIN + QR, assegnazione dispositivo→squadra, token, riconnessione, round authoritative | test risposte + simulazione senza perdite né duplicati |
| P4 | Export JSON/CSV/report HTML | test report |
| P5 | Pack neutro `packs/<id>/`, import v3, `PACK_FORMAT.md`, `PACK_TEMPLATE/` | test pack v3/nuovo/invalido |
| P6 | `/network-test`, stress 2/6/15/30 client, log tecnico esportabile | simulazione 30 client |
