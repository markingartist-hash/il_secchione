# v3.7.3 CONTENT IMPORT AND PODIUM REVEAL — 5 ottobre 2026

Base obbligatoria: `Il_Secchione_v3.7.2_REVEAL_FIX_PORTABLE.zip` (SHA-256 `5661c38640128990bc87550a167222eb9a655ccc96f4610fcf2bbab9350fc598`). La baseline è conservata intatta in `Desktop\BASELINE_v3.7.2_REVEAL_FIX`.

Restano tutte le correzioni della baseline: matcher risposte, Pack Studio, tastierine, reveal del round dedicato e porta di riserva se è già in esecuzione una versione vecchia.

## 1. IMPORTA CONTENUTI: un solo ingresso, nessun dubbio su dove rimettere un file

Nuovo pulsante **📥 IMPORTA CONTENUTI**, nella colonna sinistra sotto PACCHETTI e SCALETTA. Il file si sceglie lì oppure si trascina in un punto qualsiasi della regia. Anche i pulsanti IMPORTA di ARCHIVIO e IMPORTA GIOCHI passano dallo stesso flusso.

Il tipo di file si riconosce **dal contenuto**, non dal nome:

| File | Che cosa succede |
|---|---|
| **Archivio domande** `.json` (ARCHIVIO → ESPORTA) | riepilogo, poi sostituisce le domande del pack attivo. Messaggio: *Hai importato 30 domande nel pack attivo: Arte romana* |
| **Archivio giochi** `.json` (GIOCHI → ESPORTA GIOCHI) | tabella per tipo (ora / nel file / dopo), poi sostituisce le manche dei tipi presenti nel file. Messaggio: *Hai importato 10 giochi nel pack attivo* |
| **Pacchetto completo** `.zip` (o pack `.json`) | viene installato nella libreria con lo stesso flusso di PACCHETTI, senza cambiare sezione. Messaggio: *Pacchetto installato correttamente*, con **● ATTIVA ORA** |
| **Scaletta** `.json` | viene aggiunta alle scalette, con **📋 APRI LA SCALETTA** |
| **JSON completo dei risultati** | viene spiegato che è un file di partita, non un contenuto, e nulla cambia |
| file non valido o sconosciuto | viene detto perché e quali file sono accettati; nulla cambia |

- **Conferma con backup**: prima di sostituire domande o giochi compaiono tre pulsanti.
  - **⬇ ESPORTA BACKUP PRIMA DI CONTINUARE** salva il blocco attuale (`backup_domande_<pack>_<data>.json` o `backup_giochi_…`) e poi importa;
  - **CONTINUA SENZA BACKUP**;
  - **ANNULLA**.
- **Sicurezza**: con il server, il pacchetto precedente resta comunque nel cestino dei pacchetti.
- **Semantica invariata dove già c'era**: l'import JSON è una sostituzione del blocco corrispondente, senza unione intelligente.
  - **Domande**: come prima, si sostituiscono tutte.
  - **Giochi**: vengono sostituiti i tipi di gioco presenti nel file; i tipi assenti restano. Il vecchio IMPORTA GIOCHI invece *aggiungeva* le manche: ora si comporta come richiesto dal passaggio di consegne, e la tabella del riepilogo lo mostra prima.
- **Persistenza**: domande e giochi importati vengono salvati **nel pacchetto installato**, come già facevano le modifiche delle domande dalla v3.6.0, quindi restano dopo la chiusura e riapertura del programma.
  - Se il pacchetto è in sola lettura (senza server), restano in questo browser e il messaggio lo dice.
  - **Correzione inclusa**: prima, Photopuzzle e Abbinamenti importati non sopravvivevano alla riapertura, perché la copia del browser salvava solo i tipi dell'editor dei giochi.
- **Blocchi**: niente sostituzioni con una domanda o un gioco in corso, né in sessione mista (bisogna attivare un solo pacchetto).
- **Aiuti brevi**:
  - in ARCHIVIO: *Importa qui un file .json esportato dall'archivio domande. Per un pacchetto completo usa 📥 IMPORTA CONTENUTI o 📦 PACCHETTI.*
  - in GIOCHI: lo stesso per i giochi.

## 2. CLASSIFICA FINALE: proclamazione dall'ultimo al primo

A fine partita (ultima domanda dell'archivio o fine della scaletta) non compare più subito la tabella completa:

1. Schermata introduttiva a tutto schermo: **CLASSIFICA FINALE · Ecco il verdetto.**, con il numero di squadre in gara.
2. Ogni **AVANTI** (pulsante principale della regia o tasto →) rivela **una** posizione, dall'ultima alla prima.
   - Le posizioni non ancora rivelate restano al loro posto come carte coperte "?": la classifica non si sposta e il podio crea attesa.
3. Il **1° posto** arriva per ultimo. L'azione principale diventa **★ RIVELA IL 1° POSTO**, poi c'è un ingresso più forte (salita, leggero ingrandimento, riflesso dorato) e un suono dedicato.
4. A verdetto completo la regia propone **⌂ HOME** e **📄 REPORT DI CLASSE**; altri AVANTI non fanno nulla.

**Le carte**:
- ogni carta mostra posizione, nome della squadra, punteggio totale grande, e ORO / ARGENTO / BRONZO per il podio;
- mostra anche ✓ corrette, ✗ errate e Ø astensioni, contate solo sui round confermati;
- **EX AEQUO** indica i pari merito, che hanno la stessa posizione.

**Layout**:
- fino a 4 squadre: carte grandissime;
- 5–8 squadre: una colonna;
- oltre 8: podio **2–1–3** grande in alto e le altre in colonne compatte. Il podio non viene mai miniaturizzato.

**Regia**:
- l'azione principale dice esattamente che cosa succede ("▶ RIVELA IL 5° POSTO", "▶ RIVELA L'11° POSTO") e quanti posti sono già rivelati;
- **MOSTRA TUTTA LA CLASSIFICA** è secondaria.

**★ CLASSIFICA a metà partita** mostra subito tutte le squadre, con le stesse carte.

**Ripresa**: il punto del reveal entra nell'istantanea. Dopo un refresh della regia si riparte dalla stessa posizione; lo SHOW ricaricato mostra lo stesso stato.

## 3. Coerenza con il reveal del round

La finale usa la stessa grammatica della classifica del round della v3.7.2: intestazione `resultHeader` con indicatore di avanzamento, cerchi di posizione `resultPos`, toni del podio oro/argento/bronzo e sfondo blu scuro. Il flusso è uno solo:

> RIVELA (soluzione) → AVANTI (classifica del round) → … → AVANTI a fine partita (classifica finale, una posizione per volta)

La classifica del round mantiene la sua rivelazione automatica a cascata, come nella v3.7.2. La finale invece è condotta dal docente, perché è il momento della proclamazione.

## Nota sulle scelte UX

- **Riconoscere dal contenuto, non chiedere**: il docente non deve sapere che cosa ha esportato e da dove. Il riepilogo dice **che cosa** è il file e **dove** andrà prima di toccare qualcosa.
- **Backup come prima scelta**: il pulsante più grande e colorato è *Esporta backup prima di continuare*; sostituire senza backup resta possibile ma è il secondo.
- **Giochi per tipo**: un file con sole Staffette non deve cancellare i Photopuzzle. La tabella mostra in giallo i tipi sostituiti e in verde quelli che restano.
- **Proclamazione a carte coperte**: le posizioni non rivelate restano al loro posto, così la classifica non salta e il podio coperto crea attesa. Il docente può commentare ogni posizione prima di passare alla successiva.
- **Mascotte assente nella finale**: lascia lo spazio alle squadre, come chiesto.
- **Animazioni** solo transform/opacity e brevi (0,6–1,15 s); con movimento ridotto le carte compaiono senza animazione.

## File modificati

- **Nuovi**:
  - `tests/content_import_podium_373.test.js`, 12 test;
  - `CHANGELOG_V3_7_3.md`;
  - `QA/TEST_RESULTS_V3_7_3.md`;
  - `QA/IMPORT_PODIUM_MANUAL_TEST.md`;
  - `QA/v3.7.3/*`.
- **Modificati**:
  - `js/app.js`: import contenuti, salvataggio giochi nel pacchetto, classifica finale, regia;
  - `js/engine/packlib.js`: `contentKind`, `replaceGames`, `cleanGameSet`, `storedQuestionId`;
  - `js/engine/roundControl.js`: azione RIVELA della finale, articoli delle posizioni;
  - `js/host/packs-ui.js`: un file trascinato va a IMPORTA CONTENUTI;
  - `index.html`;
  - `css/show.css`;
  - `css/classroom.css`;
  - `server/server.js` (solo la versione);
  - i documenti.
- **Test della baseline**: invariati, salvo il numero di versione atteso in `tests/session_planner_370.test.js` (3.7.2 → 3.7.3).

## Non modificato

- matcher;
- scoring di base;
- rete e protocollo;
- Player;
- Pack Studio;
- formato dei pacchetti;
- giochi;
- scaletta.

Nessun cloud, account o merge avanzato.
