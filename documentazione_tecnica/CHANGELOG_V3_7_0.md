# v3.7.0 SESSION PLANNER — 5 ottobre 2026

Nuova release costruita sulla **v3.6.1 CLASSROOM FLOW**, che resta intatta (`Il_Secchione_v3.6.1_CLASSROOM_FLOW_PORTABLE.zip`, SHA-256 `5787426284b0ecd4dc66eeeb1e389a2782b67774f28adde4938b10462e18609c`). Due novità, previste dalla roadmap del passaggio di consegne v3.6.1:
- **A. Scaletta della puntata**;
- **B. Regia "one screen"**.

## Inventario prima di iniziare (sulla baseline v3.6.1)

| Area | Stato trovato | Scelta |
|---|---|---|
| Scaletta, playlist o planner | assente | modulo nuovo `js/engine/sessionPlan.js` |
| Più pacchetti nella stessa partita (`activePacks`, `_packId` nei giochi) | presente | riusato: la scaletta attiva da sola i suoi pacchetti |
| PROSSIMA = chiudi + Ø + punti + avanti (`settleQuestionForNext`) | presente | riusato: in scaletta AVANTI chiama la stessa funzione |
| Stato in regia: fase, timer, progresso, pulsantiere | presente | riusato come banda STATO |
| Comandi della domanda (AVVIA, PAUSA, +10 s, RIVELA, MODIFICA, ANNULLA, RIPETI, RIAPRI) | presenti nella scheda DOMANDA | spostati nella regia, con gli stessi id e le stesse funzioni |
| Comandi dei giochi | solo nella scheda GIOCHI | spostati nella regia; nella scheda restano solo preparazione e punti |
| Azione principale contestuale | assente | nuova: `roundControl.cockpit()` |

## A. Scaletta della puntata

Nuovo pulsante **📋 SCALETTA**, nella colonna squadre e nella regia quando si è in Home.

- **Scelta dei contenuti** da uno o più pacchetti installati:
  - domande A/B/C/D e manche dei 5 giochi;
  - ricerca senza accenti, filtri per argomento e difficoltà;
  - aggiunta singola (＋), dei selezionati o di tutti quelli in elenco.
- **Anteprima** di ogni elemento: titolo, tipo, pacchetto, difficoltà, argomento.
- **Ordine**: si trascina col mouse oppure si usano ↑ ↓. La posizione negli elenchi non si perde a ogni modifica.
- **Togli (✕)** e **duplica (⧉)**.
  - La duplicazione è esplicita: in classe l'elemento duplicato diventa un nuovo round, con i punti già assegnati mantenuti e `repeatOf`.
  - Nessuna duplicazione silenziosa: un contenuto già presente compare come "✓ in scaletta" e non si può aggiungere di nuovo per sbaglio.
- **🔀 MESCOLA SOLO LE DOMANDE**: i giochi restano al loro posto.
- **Nome e salvataggio automatico** a ogni modifica, poi riapertura dall'elenco. Le altre azioni:
  - **DUPLICA** la scaletta;
  - **ESPORTA** e **IMPORTA** un file `.json`, come copia locale, senza condivisione online;
  - **ELIMINA**, che non tocca domande, giochi o pacchetti.
- **Solo riferimenti, nessuna copia dei contenuti**:
  - le domande si riferiscono con `packId` + `questionId` (`packId/idOriginale`);
  - i giochi con `packId` + tipo + titolo della manche, più l'occorrenza se due manche dello stesso pacchetto hanno lo stesso titolo;
  - la scaletta conserva solo un'anteprima per riconoscere ciò che manca.
- **Contenuti mancanti**: una domanda eliminata, una manche rinominata o un pacchetto non installato restano in elenco in rosso come **MANCANTE**, con il motivo, e non vengono mai sostituiti con altro.
  - All'avvio la regia chiede conferma e li salta.
  - Se un contenuto sparisce durante la lezione, viene saltato con un avviso.
- **In classe**:
  - **▶ AVVIA SCALETTA** attiva da sola i pacchetti necessari: squadre, punti e pulsantiere restano;
  - poi il docente usa quasi solo **AVANTI**. AVANTI applica le regole di sempre (chiude il round, segna le mancanti come Ø, registra i punti) e apre l'elemento successivo, domanda o gioco;
  - ← e → sulla tastiera e i pulsanti ← → della colonna seguono la scaletta;
  - il palco, lo SHOW e i tablet contano le domande della scaletta ("DOMANDA 3 / 10");
  - una deviazione (una domanda aperta dall'Archivio, un gioco scelto a mano) non viene attribuita alla scaletta, e AVANTI riporta all'elemento giusto;
  - tornando indietro si vede il round già confermato e non se ne apre uno nuovo;
  - HOME e CLASSIFICA non perdono il segno: **▶ RIPRENDI SCALETTA**;
  - **✕ nel chip della scaletta** la interrompe: squadre e punti restano.
- **Ripresa**: la scaletta in corso è nell'istantanea della regia. Dopo un refresh o un riavvio, RIPRENDI torna allo stesso elemento.
- **Report e dati**:
  - la sessione contiene `plans[]`, con ogni elemento: posizione, tipo, `packId`, `packVersion`, `questionId`/`sourceQuestionId` oppure tipo e titolo del gioco, ed esito (`played`, `skipped`, `missing`, `not_played`);
  - ogni round registrato in scaletta ha `planItem` (`planId`, posizione);
  - il report HTML ha la sezione **Scaletta**;
  - la provenienza delle risposte (`packId`, `packVersion`, `sourceQuestionId`) è quella di sempre.
- **Dove si salvano**: nelle preferenze della regia, cioè nel browser e nella copia su disco `data/prefs.json` già esistente. Se il browser le perde (pulizia dati, porta diversa), all'avvio la regia le recupera dal server; per ogni scaletta vince la copia più recente.

## B. Regia "one screen"

Sopra le schede, sempre visibile durante domande e giochi, la regia ha tre fasce.

1. **STATO**:
   - fase e timer;
   - "Poi: …", cioè l'elemento successivo;
   - 📱 pulsantiere collegate *n / n*;
   - chip della scaletta (*n / n*, ✕);
   - ✍ risposte ricevute *n / n*;
   - mini indicatore **Ø gratis**, solo quando a una squadra resta al massimo 1 astensione gratuita.
2. **AZIONE PRINCIPALE**: un solo pulsante grande, quello più probabile adesso.
   - **AVVIA** (domanda o gioco);
   - **RIVELA**;
   - **PROSSIMA / AVANTI**, con "poi: …";
   - in Parola Segreta: **SCEGLI A / SCEGLI B**, con i voti dei tablet;
   - in Staffetta: **PAROLA SUCCESSIVA**;
   - a fine scaletta: **★ FINE SCALETTA**, poi **⌂ HOME** e **📄 REPORT**.
3. **AZIONI SECONDARIE**, solo quelle sensate nella fase:
   - pausa / riprendi, +10 s, chiudi tempo;
   - ✕ ANNULLA ROUND, ↺ RIPETI, ↺ RIAPRI PUNTI, ✎ MODIFICA;
   - ↶ ANNULLA ULTIMA (registrazione);
   - SALTA;
   - per i giochi: + INDIZIO, ELIMINA 2, + LETTERA, RIVELA 1, − 1 PEZZO (disattivati quando finiscono).

**Nessun doppione**: i comandi non esistono più due volte.
- Gli stessi pulsanti, con gli stessi id storici (`launchQuestionBtn`, `revealBtn`, `nextQBtn`, `startIndovinaBtn`…) e le stesse funzioni, sono stati **spostati** dalla scheda DOMANDA e dalla scheda GIOCHI alla regia.
- Nelle schede restano la soluzione privata, la griglia delle risposte (MANCANTI = Ø, CONFERMA PUNTI) e, per i giochi, la preparazione della manche (scelta, modifica, immagini, termini) e RISPOSTE E PUNTI.
- Un test verifica che nessuna azione compaia due volte e che ogni azione corrisponda a una funzione esistente.

Le funzioni nuove per i giochi riusano quelle esistenti:
- **ANNULLA ROUND / RIPETI MANCHE**: stessa manche da capo; nessun punto per il round scartato, punti mantenuti se già confermati;
- **AVANTI** da un gioco con risposte registrate conferma i punti come PROSSIMA DOMANDA (mancanti = Ø). Senza risposte chiede se proseguire senza punti.

**Schermi bassi** (1366×768, 1280×720, 1024×768): la regia si compatta.
- L'aiuto testuale diventa il suggerimento del pulsante principale.
- "Poi:" sta su una riga.
- La griglia delle risposte resta in vista a 1366×768.

## Correzioni

- `repeatOf` non sopravvive più a un cambio di domanda. Prima, con ↺ RIPETI seguito da → senza avviare la domanda, il round della domanda successiva veniva marcato per errore come ripetizione. Il difetto era già presente nella v3.6.1.

## Cosa NON cambia

- answerMatcher;
- protezione CSV;
- regole e formule di punteggio, comprese le 3 astensioni gratuite;
- protocollo PLAYER/SHOW e WebSocket;
- server (solo il numero di versione), Player e mascotte;
- formato dei pacchetti.

Non sono stati aggiunti: calendario, cloud, account, condivisione online, IA, framework o dipendenze.

## File

- **Nuovi**:
  - `js/engine/sessionPlan.js`, modello puro della scaletta;
  - `js/host/planner-ui.js`, finestra SCALETTA;
  - `tests/session_planner_370.test.js`, 18 test.
- **Modificati**:
  - `js/app.js`: integrazione, regia one screen, numerazione, istantanea, preferenze;
  - `js/engine/roundControl.js`: `cockpit()`, `freeOmissionAlert()`;
  - `js/engine/report.js`: sezione Scaletta;
  - `js/host/store.js`: `loadServerPrefs()`;
  - `index.html`;
  - `css/classroom.css`;
  - `server/server.js`: solo la versione;
  - i documenti.
