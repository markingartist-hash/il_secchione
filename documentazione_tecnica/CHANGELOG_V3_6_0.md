# v3.6.0 CLASSROOM CONTROL — 5 ottobre 2026

Release di **controllo della regia**: durante la lezione il docente corregge un errore, recupera da un imprevisto e controlla i tablet senza tornare alla Home e senza perdere domanda, squadre, punteggi o risposte. Nessuna nuova modalità di gioco, nessun nuovo scoring.

Baseline obbligatoria: `Il_Secchione_v3.5.4_ANSWER_MATCHER_PORTABLE.zip`, SHA-256 `123cdd1ae63f6b8c78b904a50ac6c3bcff19038f475274ea4441d85186ef4484`. Stato iniziale: 208/208 checksum, 165 test superati, simulazione 2/6/15/30 senza perdite. La baseline è conservata immutata in `Desktop\BASELINE_v3.5.4_ANSWER_MATCHER`.

## Novità
1. **✎ MODIFICA DOMANDA** nella domanda corrente.
   - Usa la stessa finestra dell'Archivio e salva nel **pacchetto installato**, con lo stesso salvataggio di Pack Studio: sostituzione, copia di sicurezza nel cestino e versione +0.0.1. Nessun quarto sistema di override.
   - La copia del browser (`bankOverrides`) resta solo come ripiego quando il pacchetto è in sola lettura (pacchetti del programma senza server), e il messaggio lo dice.
   - Eliminato il ritorno alla Home (`showHome()` / `qRound = null`) dopo una modifica.
2. **Modifica in anteprima**: resta la stessa domanda (`qIndex`), con squadre, punteggi e sessione intatti. Testi e risposta corretta si aggiornano nella stessa disposizione delle alternative, SHOW compreso. Messaggio "✓ Modifica salvata".
3. **Round aperto immutabile**: a timer partito la finestra offre due scelte.
   - **Salva per le prossime volte**: il round continua con la versione giocata, che resta anche dopo un refresh della regia, e la modifica entra quando si lascia la domanda.
   - **Salva e riavvia domanda**: chiede conferma, annulla il round (nessun punto, risposte scartate, round chiuso sui tablet) e ricostruisce l'anteprima con la versione nuova.
4. **✕ ANNULLA DOMANDA**: chiede conferma e chiude il round anche sui tablet (`round.close` esistente); le risposte tardive vengono rifiutate.
   - Elimina solo le risposte del round, non assegna punti e torna all'anteprima della stessa domanda.
   - Sessione, squadre e punteggi restano; la domanda resta nel pacchetto.
5. **↺ RIPETI DOMANDA**: dopo la soluzione o la fine del round, un nuovo round pulito (nessuna risposta, tempo o ordine precedenti). I punti del primo tentativo restano; il nuovo round è marcato `repeatOf`. Se i punti non erano confermati, equivale ad ANNULLA.
6. **Stato pulsantiere sempre visibile**: "📱 5 / 6 COLLEGATE · Disconnessa: 3B (da 12 s, in attesa di riconnessione)" sotto il timer della regia.
   - Avviso non bloccante quando una pulsantiera si disconnette; nessun popup.
   - Rafforza l'indicatore già presente nell'intestazione e i pallini per squadra, che restano.
   - Unica modifica di rete: `teamDevices()` in `net.js` espone il `lastSeen` che il server già inviava. Protocollo invariato.
7. **Progresso**: "Domanda 7 / 30 · giocate 6 · da giocare 24 · questa: giocata" e il segno "✓ giocata" nell'Archivio. "Saltata" non esisteva e non è stata aggiunta.
8. **Navigazione sicura**: uscire da una domanda avviata senza risposte chiede conferma e chiude il round anche sui tablet. Prima restava aperto, cioè un "round fantasma". Restano la conferma esistente per le risposte mancanti e la conferma automatica quando hanno risposto tutte.
9. **Ricerca nell'Archivio**: testo, alternative, spiegazione, argomento, categoria e tag, ignorando maiuscole e accenti; filtri per argomento e difficoltà; **Vai** per aprire una domanda. Nessun filtro per tipo, perché oggi tutte le domande sono a scelta multipla.
10. **Risposte alternative accettate in Pack Studio**: Photopuzzle, Indovina, Parola Segreta e ogni collegamento della Staffetta.
    - Si possono aggiungere, modificare, riordinare ed eliminare; la risposta principale resta distinta.
    - Vuoti e doppioni dopo la normalizzazione dell'**answerMatcher esistente** vengono ignorati al salvataggio, con avviso nel Controllo. Nessun secondo matcher.
11. **Messaggi coerenti**: lo stesso `toast()` ora distingue ✓ / ⚠ / ✗ con colori diversi e durata maggiore per avvisi ed errori. Nessun `alert()`.
12. **Ghigliottina sui tablet** (bug segnalato): prima, durante le coppie A/B, il tablet restava in attesa e non si poteva scegliere.
    - Ora ogni coppia apre un round A/B sul tablet, con lo stesso protocollo delle domande (`layout: 'mcq'`, lettere `A`/`B`, nessun esito inviato).
    - I voti compaiono sui pulsanti della regia. Quando tutte le pulsantiere collegate hanno votato sceglie la maggioranza; in caso di parità, o in ogni momento, sceglie il docente.
    - Le coppie non assegnano punti, come prima. La finale con la tastiera resta invariata.

## Funzioni già presenti, rafforzate e non duplicate
- +10 s, pausa/ripresa, ■ CHIUDI, ● RIVELA, ↺ RIAPRI PUNTI, sblocco del tablet.
- Indicatore "N/M PULSANTIERE" nell'intestazione e pallini per squadra.
- Ripresa della partita e riconciliazione col server.
- Rientro automatico dei tablet; cache dello SHOW per chi si ricollega.
- Finestra di modifica dell'Archivio, `PackLibrary.save` di Pack Studio, answerMatcher e protezione CSV (non toccati).

## File
- **Nuovi**:
  - `js/engine/roundControl.js`: logica pura, testata in Node;
  - `tests/classroom_control.test.js`: 17 test;
  - `CHANGELOG_V3_6_0.md`, `QA/TEST_RESULTS_V3_6_0.md`, `QA/CLASSROOM_CONTROL_MANUAL_TEST.md`, `QA/v3.6.0/*`.
- **Modificati**:
  - `js/app.js`: regia;
  - `js/host/net.js`: `lastSeen` nella vista per squadra;
  - `index.html`: pulsanti, indicatore, ricerca, finestra di modifica, script;
  - `css/classroom.css`: stili della sola regia;
  - `js/engine/packstudio.js` e `js/studio/studio.js`: risposte alternative;
  - `studio.html`: carica l'answerMatcher;
  - `server/server.js`: solo la stringa `VERSION`;
  - documentazione, `RELEASE.json`, `SHA256SUMS.txt`.
- **Invariati**, byte per byte:
  - `js/engine/answerMatcher.js`, `js/engine/report.js` (CSV), `js/engine/scoring.js`;
  - `server/room.js`, `server/ws.js`;
  - `js/player.js`, `player.html`, `css/player.css`, `css/show.css` (mascotte);
  - `js/show-client.js`;
  - tutti i test della baseline.

## Limiti noti
- La modifica dalla regia salva nel pacchetto: ogni salvataggio scrive l'intero pacchetto e lascia una copia nel cestino `data/cestino_pacchetti/`, che va svuotato a mano se cresce.
- Senza server, i pacchetti del programma sono in sola lettura: la modifica resta nella copia di questo browser (avviso ⚠).
- In una sessione mista la modifica della domanda corrente salva nel pacchetto d'origine. Nuova, elimina, mescola e importa dell'Archivio restano disattivati, come prima.
- Un round annullato resta nella memoria del server, chiuso, finché non se ne apre un altro. Le sue risposte non vengono più accettate né usate dalla regia; restano nel log tecnico.
- Dopo un refresh della regia, un round in corso riprende in pausa (comportamento esistente). La versione giocata e le modifiche in attesa sono conservate.
- Il "da N s" della disconnessione conta dall'ultimo contatto registrato dal server, che avviene a intervalli di qualche secondo.
- I voti A/B della Ghigliottina non vengono ricostruiti dopo un refresh della regia; la scelta resta possibile dal docente.
