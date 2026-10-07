# Il Secchione · Training Edition 1.0 RC1 — 6 ottobre 2026

Release candidate per il corso di formazione docenti di gennaio 2027. **Feature freeze**: solo gli interventi approvati dopo l'audit (`Desktop\AUDIT_RC1_v3.7.2`).

- **Base**: v3.7.3 CONTENT IMPORT AND PODIUM REVEAL (ZIP SHA-256 `0dedc728a5d6a8318eceeb3bdbfd1ded040b88291a188a24732cb8f49a73adfd`).
- **Verifica della base**: 245/245 checksum, 225 test verdi; il diff rispetto alla v3.7.2 riguarda esattamente i 16 file attesi (import unificato e reveal finale integri).

## 1. Punteggio: il tempo conta solo se misurato (P0 dell'audit)
- **Regola**: se nel round c'è almeno una **risposta raccolta a mano**, tutte le corrette sono **ex aequo** e prendono i punti del 1° posto, senza bonus di velocità. L'ordine di digitazione non è mai usato come ordine di risposta.
  - Errate e omissioni seguono il profilo attivo. Con solo tablet resta l'ordine del tempo misurato.
- **Che cosa conta come risposta raccolta a mano**: A/B/C/D, un giudizio nei giochi o uno 0 digitato dal docente.
  - **Non contano** le Ø riempite in automatico (MANCANTI = Ø, AVANTI, tablet scaduto), ora marcate `auto` anche nei giochi: non contengono alcun ordine tra corrette.
- **Dove**:
  - la regola è in `engine/scoring.js`, quindi è identica per regia, server, ricalcolo dello storico e CSV;
  - la regia mostra «CORRETTE EX AEQUO» al posto del riordino ▲;
  - nella classifica del round le corrette condividono il 1° posto con «EX AEQUO».

## 2. Omissioni gratuite ricontate dopo riapertura o annullamento (P1 dell'audit)
- `SS.renumberOmissions()` rinumera le omissioni **in ordine di apertura dei round** e aggiorna solo gli eventi «omessa»; corrette ed errate (anche le correzioni del server) non vengono toccate.
- La regia la usa a ogni conferma, a ogni riapertura (quindi anche negli annullamenti) e al cambio di profilo.
- **Server**: per le omissioni precedenti conta solo i round aperti **prima** di quello confermato (`openedAt`, ora inviato dalla regia).
  - Prima contava tutti gli altri round, anche quelli successivi, e poiché il server prevale avrebbe annullato la correzione della regia.

## 3. Photopuzzle: cover + punto focale (patch richiesta, assente nella 3.7.2)
- `css/show.css`: `.puzzleFrame>img{object-fit:cover;object-position:var(--focus,center)}`. Solo il Photopuzzle; nessun'altra schermata cambia.
- `PE.photoFocus()` valida e normalizza il campo facoltativo `focus` (due percentuali, oppure alto/basso/sinistra/destra/centro). `validateGame` lo conserva e rifiuta valori non validi con un messaggio leggibile.
- **Regia**: `puzzleFocus()` e `loadArcadePreset` portano il focus nello stato; un'immagine caricata dal PC riparte dal centro.
- **Pack Studio**: campo «Punto focale (facoltativo)» e anteprima con cover. Andata e ritorno Studio → libreria → esporta → reimporta verificati da test.

## 4. Regia e percorso del docente
- **Checklist «PRONTO PER LA LEZIONE»** in Home: programma (con indirizzo dei tablet), squadre, proiettore, pulsantiere, contenuti. Ogni riga ha il suo pulsante.
- **QR e PIN sullo SHOW**: schermata «COLLEGATE I TABLET» con QR grande, indirizzo, PIN e tablet collegati; sparisce quando inizia il gioco.
- **Proiettore**: un solo comando, «SCHERMO PROIETTORE · APRI», con istruzioni se il browser blocca la finestra e dopo l'apertura (trascina, F11).
- **✓ TERMINA PARTITA**: azione principale a verdetto completo. Ricorda il report se non è stato esportato, archivia, e al prossimo avvio non compare «partita non conclusa»: le squadre tornano in silenzio.
- **Avviso prima di Ø**: il pulsante principale e un chip mostrano le squadre senza risposta. Il primo AVANTI avvisa con i nomi, il secondo le registra come Ø (domande e giochi).
- **Senza tablet = stesso programma**: `AVVIA_SENZA_TABLET.bat` richiama l'avvio normale, quindi un solo luogo per partite, scalette e impostazioni.
- **Testi tecnici fuori dalla vista del docente**:
  - via versione, OUTPUT 16:9, RETE LAN, SFX+, «MODALITÀ MANUALE» e l'id dei pacchetti;
  - la versione resta come suggerimento sullo stato in alto;
  - «JSON COMPLETO · backup e ripresa» diventa «COPIA PER L'ASSISTENZA · non si reimporta» e «LOG TECNICO» diventa «REGISTRO PER L'ASSISTENZA»;
  - export con il nome del file e la cartella Download;
  - messaggi della finestra nera senza comandi da terminale.

## 5. Documenti
- **In radice**: `INIZIA_QUI.html` (una pagina), `GUIDA_DOCENTE.html`, `RISOLUZIONE_PROBLEMI.html` (con la procedura manuale di copia di sicurezza: cartelle `packs` e `data`).
- **Tutto il materiale tecnico** (README, architettura, changelog, QA, formati) è in `documentazione_tecnica/`.
- `documentazione_tecnica/QA/CHECKLIST_DOCENTE_SCONOSCIUTO.md`: il test da eseguire con un docente esterno.

## 6. Correzioni nate dall'E2E nel browser
- **Avviso «senza risposta» con AVANTI vero**: nel collaudo il primo AVANTI mostrava l'avviso ma, nell'archivio, passava comunque alla domanda seguente **senza confermare i punti**. In scaletta, invece, riempiva le Ø nello stesso clic.
  - Causa: `nextQuestion` e `planNext` leggevano il «no» di `showQuestionResults()` come «niente da mostrare».
  - Correzione: se l'avviso è appena comparso, quel clic si ferma lì.
  - Nuovi test che percorrono `nextQuestion`/`planNext` in archivio e in scaletta: falliscono sul codice precedente e passano su quello corretto.
- **Legenda della classifica del round**: in un round ex aequo non dice più «ordinate per velocità», ma «corrette ex aequo: risposte inserite a mano, nessun bonus di velocità».

## Non fatto, come deciso
- Backup completo automatico e ripristino da file.
- Altri P2: classifica del round per i giochi, partite archiviate consultabili, avviatore Mac/Linux, autosave più leggero, comandi ridondanti in colonna.

## Test
- **Baseline aggiornati**, per comportamento approvato:
  - `room.test.js`: una Ø digitata a mano rende ex aequo le corrette, 300/300 invece di 300/275;
  - `content_import_podium_373.test.js`: a verdetto completo l'azione principale è TERMINA PARTITA;
  - `session_planner_370.test.js`: versione e stub della nuova funzione `missingGuard`.
- **Nuovi**: `tests/training_rc1.test.js` (25 test). Totale **250 superati, 0 falliti**.
- Risultati in `QA/TEST_RESULTS_TRAINING_1.0_RC1.md`.
