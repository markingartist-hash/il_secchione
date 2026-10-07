# ARCHITECTURE — Il Secchione v3.5 CLASSROOM

Principio: **Classroom-First, Institution-Ready.** Funziona bene in classe oggi, con un modello dati e moduli che permettono di arrivare a qualificazioni e tornei d'istituto senza riscrivere il motore.

## 1. Componenti

```text
           PC del docente                                         rete locale (senza Internet)
┌─────────────────────────────────────────────┐
│  Browser: REGIA  index.html  (/host)        │         ┌──────────────────────────┐
│   js/app.js         flusso, palco, giochi   │         │ Tablet: /player          │
│   js/engine/*       motore neutro (puro)    │         │  js/player.js (ES5)      │
│   js/host/store.js  SessionStore browser    │◄──WS───►│  A B C D + INVIA         │
│   js/host/net.js    client WS regia         │    │    └──────────────────────────┘
│   js/host/devices-ui.js finestra tablet     │
│   js/host/planner-ui.js finestra Scaletta   │    │    ┌──────────────────────────┐
│        │ window.open (doppio schermo v3)    │    ├───►│ /show (sola lettura)     │
│        ▼                                    │    │    └──────────────────────────┘
│  Finestra PALCO sul proiettore              │    │    ┌──────────────────────────┐
└──────────────┬──────────────────────────────┘    └───►│ /network-test            │
               │ http://localhost:8765                  └──────────────────────────┘
┌──────────────▼──────────────────────────────┐
│  Node: server/server.js  (HTTP + WebSocket) │
│   server/room.js   stato AUTORITATIVO       │
│   server/store.js  JSON atomico su disco    │
│   js/engine/*      stesso motore della regia│
└─────────────────────────────────────────────┘
```

**Senza server** (doppio clic su `index.html` o `AVVIA_SENZA_TABLET.bat`) la regia funziona da `file://` in modalità manuale. Tutte le chiamate di rete diventano innocue e i salvataggi restano nel browser.

## 2. Motore neutro (`js/engine/`, browser + Node, ES2017 senza `?.`)

| Modulo | Responsabilità |
|---|---|
| `scoring.js` | **Unica** fonte del punteggio. Profili `legacy_v3`, `show_standard` (predefinito), `learning`. `scoreRound(records, profilo)` deriva i punti dai record grezzi; `rankPoints`, `totals`, `rulesSummary`. |
| `timer.js` | Countdown puro con orologio passato dall'esterno: `secondsFor(domanda)`, start, pausa, ripresa, `addTime`, snapshot per l'autosave. |
| `session.js` | Sessione, `Participant` (`team` \| `individual`), record grezzi `makeResponse`, eventi di punteggio, log tecnico, `recomputeTotals` con un altro profilo. |
| `packs.js` | Validazione e normalizzazione dei pack, compatibilità v3, nomi neutri dei giochi. |
| `report.js` | CSV (contratto v2, celle neutralizzate per i fogli di calcolo: [EXPORT_CSV.md](EXPORT_CSV.md)), report HTML, statistiche e log tecnico. |
| `sessionPlan.js` | Scaletta della puntata (v3.7.0): elementi che sono solo riferimenti (`packId`+`questionId`, `packId`+tipo+titolo+occorrenza), aggiunta senza duplicati silenziosi, duplicazione esplicita, ordine, mescola solo domande, risoluzione sui pacchetti installati con MANCANTI mai sostituiti, esecuzione (posizione, successivo giocabile), record per la sessione e il report, validazione per import e preferenze. |
| `roundControl.js` | Controllo della regia in lezione (v3.6.0) e regia "one screen" (v3.7.0): `cockpit(stato)` restituisce l'unica azione principale e le azioni secondarie della fase; ogni azione è una funzione già esistente di `app.js`. |
| `packstudio.js` | Modello di Pack Studio: bozza, domande, manche, immagini piatte, validazione con indicazione del punto da correggere, ZIP. Funzioni pure, testate in Node. |

`js/core.js` (v3) resta per le utility del palco (mescolamento, puzzle, catena). Le sue vecchie `rankPoints`/`scoreOutcome` non sono più usate.

## 3. Dati: PERFORMANCE separata dal GAME SCORE

```text
session
├─ meta: institution, schoolYear, gradeLevel, classLabel, competitionId, mode (lesson|qualification|final)
├─ participants[]: {id (uuid), type: team|individual, name}
├─ rounds[]:   {roundInstanceId, kind: question|arcade, questionId, number, seconds, correctAnswer,
│               displayed:[{letter, sourceIndex}], question:{text, options, category, …},   ← copia della domanda
│               openedAt, closedAt, revealedAt, committed, profileId, inputModes, orderOverridden}
├─ responses[] PERFORMANCE: {responseId, sessionId, roundInstanceId, questionId, participantId, participantType,
│               selectedAnswer, selectedSourceIndex, correctAnswer, outcome: correct|wrong|omitted,
│               responseTimeMs (null se non misurato), inputMode: manual|tablet, order, deviceId, auto, receivedAt, voided?}
├─ scoreEvents[] GAME SCORE: {roundInstanceId, participantId, outcome, rank, points, profileId}
├─ adjustments[] (predisposto per rettifiche manuali)
└─ log[] tecnico: timestamp, sessionId, roundInstanceId, participantId, deviceId, event, answer, accepted, reason, latency, scoreDelta
```

- Il punteggio di una squadra è **sempre** `Σ scoreEvents`, e gli scoreEvents sono **derivati** dalle responses (`scoring.scoreRound`). Si può ricalcolare tutto lo storico con un altro profilo (`recomputeTotals`), anche dalle impostazioni ("Ricalcola anche le domande già confermate").
- Le lettere sono mescolate a ogni domanda. Per questo ogni record salva `selectedSourceIndex` e ogni round salva la mappa `displayed`: la risposta resta confrontabile tra sessioni.
- "Riapri punti" non cancella nulla: le risposte precedenti restano con `voided: true`.

### 3.1 RC2-A.2 — micro-round e scale di punteggio
Un gioco a più passi produce **più round** (micro-round), ognuno con i propri record grezzi e i propri score event:

| Contenuto | Round | `scale` | Corretta (tablet) | Corretta (senza tablet) | Errata | Omessa |
|---|---|---|---|---|---|---|
| Domanda, Photopuzzle, Indovina, Abbinamenti | 1 | `standard` | 200–300 per velocità | 300, 290, 280… (min 200) | −100 | 0 (3 gratuite, poi −100) |
| Ghigliottina, scelta A/B (×5) | 1 per coppia (`ghPart: 'pair'`, `pairIndex`) | `gh_pair` | +10 | +10 | 0 | 0, non conta |
| Ghigliottina, parola finale | 1 (`ghPart: 'final'`) | `standard` | 200–300 | 300, 290… | −100 | come una domanda |
| Catena/Staffetta, ogni parola | 1 per parola (`chainIndex`) | `chain_link` | 50–100 per velocità | 100, 95, 90… (min 50) | 0 | 0, non conta |

- Helper generici in `scoring.js`: `speedRangePoints(elapsed, available, min, max)` e `rankRangePoints(rank, max, step, min)`. `speedPoints` (200–300) usa lo stesso helper.
- **Round misto**: se nel micro-round ha risposto almeno un tablet (le omissioni automatiche non contano) e c'è una CORRETTA inserita a mano, tutte le corrette valgono il minimo della scala (200 o 50). Errate e omesse a mano non tolgono la velocità.
- **Senza tablet** il rango conta solo le corrette, nell'ordine di registrazione (`correctOrder`).
- La scala è salvata nel round (`rounds[].scale`) e in ogni score event (`scale`), viaggia nel `round.commit` verso il server e viene usata da `recomputeAllRounds`, `recomputeTotals`, `renumberOmissions` e `committedOmissionCounts`. Il server la conserva in `commits[id].scale` (anche dopo il riavvio).
- **Retrocompatibilità**: i round senza `scale` (giocati fino alla RC2-A.1) mantengono le regole di allora (corretta a mano = 200), anche se ricalcolati. Un round riaperto mantiene la scala con cui era stato confermato. Con i profili senza velocità (`show_standard`, `legacy_v3`, `learning`) le scale non cambiano le regole storiche; le coppie A/B valgono 0.
- Ogni manche ha un `gameInstanceId` (`state.arcade.gameId`), salvato in tutti i suoi round: il RISULTATO DEL GIOCO somma gli score event di quei round. Annullare una Ghigliottina in corso annulla anche le coppie già confermate (`voidGameRounds`).
- Il CSV (contratto v2) non cambia: ogni coppia e ogni parola è una riga con il proprio `round_id` e i propri punti. Scala e passaggio sono nel salvataggio JSON completo.

### 3.2 RC2-A.2 — flusso di un gioco
```text
startArcade ──► INTRO (arcade.intro) ──AVVIA──► gioco ──RIVELA──► RISULTATO DEL GIOCO ──AVANTI──► contenuto successivo
                 una sola per avvio             (coppie / parole       (arcade.resultsVisible: 1° AVANTI conferma
                                                 senza nuova intro)     i punti e lo mostra, 2° AVANTI prosegue)
```
La classifica generale resta solo su ★ CLASSIFICA.

## 4. Ciclo di una domanda

```text
preview ──AVVIA──► running ──CHIUDI / fine tempo──► scoring ──CONFERMA──► scored
           │  nuovo roundInstanceId           │                    │
           │  server: round.open              │ tablet senza       │ records → scoreEvents
           │  tablet: A B C D                 │ risposta = omessa  │ server: round.commit (verifica)
           ▼                                  ▼ (auto)             ▼
        risposte tablet (server) + manuali (regia) nella stessa griglia
```

- **Ordine delle corrette**: ordine di registrazione nella regia. Per i tablet coincide con l'ordine di arrivo al server (`seq`); per l'input manuale è l'ordine di inserimento, che **non** è un tempo. Il docente può riordinare (▲) e il round viene marcato `orderOverridden`.
- **Conferma automatica**: avviene al reveal se tutte le squadre hanno risposto da tablet, e lasciando una domanda con tutte le risposte registrate. Se ne mancano, il docente sceglie.
- **Correzione manuale di un tablet**: la regia registra `inputMode: manual` e conserva nel log la risposta sovrascritta.

## 5. Server autoritativo (`server/room.js`)

Il server è l'autorità **verso i dispositivi**. Il tablet invia solo `{roundInstanceId, answer, deviceToken}`.

| Il server decide | Il server NON si fida di |
|---|---|
| round aperto / in pausa / chiuso, scadenza (+500 ms di tolleranza di rete) | timestamp del tablet |
| validità della risposta per il layout | squadra indicata dal browser (la ricava dal token) |
| timestamp di ricezione e `responseTimeMs` (pause escluse) | punteggio inviato dal browser |
| ordine di arrivo (`seq`) | stato del timer del tablet |
| prima risposta definitiva (seconda diversa: `already_answered`; uguale: idempotente) | |
| esito e soluzione (mai inviata prima del reveal) | |
| **punteggio al commit**: sostituisce i dati dei record tablet con i propri e ricalcola con `scoring.js`; la regia adotta il risultato se differisce (`score.server_override`) | |

La **regia è fidata**: è il PC del docente. Calcola le anteprime e il punteggio in modalità manuale con la **stessa funzione** del server. Non esistono due logiche di punteggio.

### Protocollo WebSocket (`/ws`, JSON)
| Da → a | Messaggi |
|---|---|
| regia → server | `hello{role:host, hostKey, sessionId, participants?}`, `participants`, `session.set`, `join.lock`, `device.assign`, `device.kick`, `round.open{roundInstanceId, layout, letters, correct, durationMs}`, `round.pause`, `round.resume{remainingMs}`, `round.addTime`, `round.close`, `round.reveal`, `round.unlock`, `round.commit{records, profileId}`, `round.uncommit`, `show.stage`, `show.timer`, `show.transition` |
| server → regia | `room.state`, `devices`, `room.update`, `round.state`, `response{record}`, `response.rejected`, `response.voided`, `round.committed{scoreEvents}`, `show.request`, `error` |
| tablet → server | `hello{role:player, pin \| deviceToken \| joinToken}`, `request{participantId}`, `answer{roundInstanceId, answer, deviceToken}`, `ping` |
| server → tablet | `welcome{status, label, deviceToken \| joinToken, participant, teams, round}`, `join.error`, `round{…senza soluzione…, myAnswer, myOutcome solo dopo il reveal}`, `ack{accepted, reason, duplicate}`, `kicked`, `pong` |
| /show | riceve `stage{html}`, `timer`, `transition`; non può inviare comandi |

### Ingresso e token
1. Il tablet entra con il **PIN** (4 cifre, solo a ingressi aperti) e riceve un `joinToken` "in attesa".
2. Il docente assegna una squadra, anche approvando la richiesta del tablet: il server genera un **nuovo `deviceToken` casuale** (128 bit). Riassegnare invalida il token precedente.
3. Il token è salvato nel `localStorage` del tablet. Con refresh, Wi-Fi perso, standby o browser chiuso il tablet rientra come la stessa squadra, **anche a ingressi chiusi**, senza duplicati.
4. **Espellere** revoca il token.

### Sicurezza proporzionata
- token casuali confrontati in tempo costante, `roundInstanceId` monouso, una risposta per squadra per round;
- rate limiting a token bucket (circa 8 messaggi/s per tablet), limite tentativi PIN per connessione e per IP, dimensione massima dei messaggi (8 KB dai tablet);
- l'**IP non autentica nessuno**: la regia richiede la `hostKey` casuale generata a ogni avvio e iniettata nella pagina `/host`, servita solo a `localhost`. Il vincolo "solo da questo PC" è un confine di installazione, non un'identità;
- i file serviti ai dispositivi sono in una **lista consentita** (pulsantiera, palco, test rete, CSS, immagini). Banca domande, codice della regia, `data/` e `server/` non sono raggiungibili dalla rete;
- il palco non contiene nel DOM soluzioni nascoste prima del reveal (Photopuzzle e Abbinamenti in v3 le nascondevano solo con il CSS).

## 6. Persistenza (`SessionStore`)

| Dove | Cosa | Quando |
|---|---|---|
| Browser `localStorage` (`js/host/store.js`) | snapshot completo di sessione e stato della regia | a ogni evento importante, ogni 5 s a timer in corsa, alla chiusura della pagina |
| `data/sessions/current.json` e `<sessionId>.json` | stesso snapshot | come sopra, se il server è attivo |
| `data/room.json` | stanza: PIN, dispositivi, token, round, risposte | a ogni cambio (debounce di 120 ms) |
| `data/logs/<sessionId>.jsonl` | log tecnico del server | una riga per evento |

- Le scritture su disco sono **atomiche** (file temporaneo + `rename`, con nuovi tentativi se l'antivirus blocca il file).
- All'avvio una partita non conclusa **non può essere sovrascritta** finché il docente non sceglie RIPRENDI, NUOVA PARTITA o ESPORTA E ARCHIVIA. La regia si collega al server solo dopo questa scelta, così non sgancia i tablet.
- Dopo un riavvio del server, un round aperto torna **in pausa** e la regia decide se riprenderlo.

## 7. Pack e separazione motore/contenuti
Vedi [PACK_FORMAT.md](PACK_FORMAT.md). `packs/<id>/*.json` è la fonte. `packs/packs.bundle.js` è generato da `tools/build_packs.js`, perché da `file://` il browser non può leggere i JSON. Il server lo rigenera all'avvio se i JSON sono più recenti.

## 8. Gestore Pacchetti
```text
file .zip/.json ──► js/lib/zip.js (lettura, DEFLATE in JS) ──► js/engine/packlib.js
                                                               ├─ readImport: pack, edizione v3 (dati JSON di js/packs.js, mai eseguiti), .json
                                                               ├─ validateImport: packs.js + immagini citate, firme, SVG, zip slip, limiti
                                                               ├─ PackLibrary: collisioni (id-2 / già installato), duplica, esporta, elimina
                                                               └─ composeBank / composeArcade / recordActivation / provenance
adattatori: server/packstore-disk.js (cartella packs/, rename atomico, cestino, bundle)
            js/host/packs-client.js (API /api/host/packs con il server; IndexedDB + pack del programma senza)
            memoryAdapter (test)
UI:         js/host/packs-ui.js (schermata PACCHETTI)   ·   CLI: tools/pack_manager.js, IMPORTA_PACCHETTO.bat
```
- Il motore di gara non conosce la libreria. `app.js` riceve le domande già composte, con id `packId/idOriginale` e `source`, e copia la provenienza nei record con `PL.provenance()`.
- I pack **in gara** (`state.activePacks`) sono separati dalle **squadre** e dalla **sessione**: attivare un pack ricostruisce domande e giochi e lascia intatte squadre, risposte e punti.
- API del server (solo regia, `X-Secchione-Host`): `GET /api/host/packs`, `POST /api/host/packs/import` (byte grezzi, `X-File-Name`), `POST /api/host/packs/<id>/duplicate`, `GET /api/host/packs/<id>/export`, `DELETE /api/host/packs/<id>`.
- Le immagini dei pack sono servite con `Content-Security-Policy: sandbox`.

### 8.1 Pack Studio (v3.5.3)
```text
studio.html ── js/studio/studio.js (interfaccia: schede, anteprima, conferme)
            ├─ js/studio/drafts.js  bozze automatiche (IndexedDB "secchione-studio": meta / data / images)
            ├─ js/engine/packstudio.js  modello puro (stesse regole di packs.js e packlib.js)
            └─ js/host/packs-client.js  save(id, zip, mode) e openBytes(id)
                 ├─ con il server: PUT /api/host/packs/<id>[?mode=replace] → PackLibrary.save → DiskAdapter.replace
                 └─ senza server:  PackLibrary.save → adattatore IndexedDB (replace in una transazione)
```
- `PackLibrary.save()` è separato da `importFile()`: l'importazione non sovrascrive mai, il salvataggio dello Studio sostituisce solo con `mode: "replace"`. Su disco la sostituzione è atomica: scrittura in una cartella temporanea, poi la precedente va nel cestino come copia di sicurezza, poi rename. Il bundle viene rigenerato.
- Immagini sempre piatte in `images/`: lo Studio normalizza i nomi e appiattisce le sottocartelle; `save()` e `writeTree()` rifiutano i nomi con `/` o `\`.
- `/studio` viene servito solo in loopback, con la chiave regia iniettata come per `index.html`; `js/studio/*` è accessibile solo in locale.
- Dopo un salvataggio lo Studio avvisa la regia con BroadcastChannel `secchione-packs` e la chiave localStorage `secchione-pack-saved`. La regia rilegge la libreria senza toccare la partita; per il pack in gara serve ATTIVA.
- **Unica fonte persistente: il pacchetto installato.** La regia può avere copie personalizzate di un pacchetto nelle sue preferenze (`il-secchione-v35-prefs`: `banks[id]` dall'ARCHIVIO, `games[id]` dall'editor dei giochi), che il gioco usa al posto del pacchetto.
  - All'apertura lo Studio include queste copie nella bozza, così parte da ciò che il gioco usa davvero.
  - Dopo il salvataggio le elimina dal browser (e dalla copia `data/prefs.json`); la regia aperta le toglie anche dalla memoria (`dropOverrides`).
  - Da quel momento gioco, esportazione e riapertura leggono tutti lo stesso pacchetto.
- Le bozze dello Studio (`secchione-studio`) servono solo a non perdere il lavoro non ancora salvato: il gioco non le usa mai e vengono eliminate al salvataggio. Se la libreria è cambiata dopo l'inizio di una bozza, la conferma di aggiornamento lo segnala.
- La copia di sicurezza nel cestino (`<id>_<data>_prima-della-modifica`) sta fuori da `packs/`: non viene caricata e non cambia l'identità del pack corrente. Non c'è una funzione di ripristino.

## 9. Palco
- **Doppio schermo classico** (pulsante APRI): finestra figlia sullo stesso PC, sincronizzata via DOM come in v3. È il metodo consigliato.
- **`/show`** (migrazione graduale): client separato che riceve dalla regia l'HTML del palco e lo stato del timer, animato in locale. Utile per un proiettore collegato a un altro dispositivo. È muto e le transizioni dei pezzi del puzzle sono meno fluide.

## 10. Scelte e limiti
- **Nessuna dipendenza npm**: WebSocket (RFC 6455) e QR code sono scritti nel progetto (`server/ws.js`, `js/lib/qr.js`). Il server è isolato in `server/` e può essere impacchettato in futuro in un eseguibile.
- **Runtime supportato: Node 24 portable incluso** (`runtime/node.exe`). Il codice condiviso evita `?.` e `??`. Con Node 8.16 due test di `pilot_hotfix` falliscono perché richiedono API di Node 10 o successivo: è solo un'informazione, non un requisito.
- **Pulsantiera in ES5**, per i tablet vecchi.
- **Una pagina web non può bloccare il tablet**: Fullscreen API e Screen Wake Lock sono usati quando il browser li supporta, su gesto dell'utente.
- **Non implementati di proposito** (fuori ambito): account, cloud, tornei, analytics, app native, hardware.
