# Risultati dei test · Training Edition 1.0 RC1

Data: 6 ottobre 2026 · Node v24.19.0 portable incluso (`runtime/node.exe`) · Windows 10 Pro 19045.

**Legenda del metodo:**
- **[ESEGUITO]**: test eseguito, con risultato registrato.
- **[ESEGUITO · BROWSER]**: provato nel browser integrato dell'app Claude (Chromium 152.0.7977.130), con un server locale, tablet simulati via WebSocket e viewport emulate. Non sostituisce la prova su proiettore e tablet veri.
- **[NON VERIFICABILE]**: richiede hardware o persone reali. Non eseguito.

## 1. Base di partenza [ESEGUITO]
- `Il_Secchione_v3.7.3_CONTENT_IMPORT_AND_PODIUM_REVEAL_PORTABLE.zip`, SHA-256 `0dedc728a5d6a8318eceeb3bdbfd1ded040b88291a188a24732cb8f49a73adfd`.
- 245/245 checksum corretti e **225 test verdi** prima di ogni modifica.
- Il diff v3.7.2 → v3.7.3 riguarda solo i 16 file attesi: import unificato e reveal finale integri.

## 2. Test automatici [ESEGUITO]
`node tests/run.js` → **250 superati, 0 falliti** (log: `QA/v1.0-rc1/tests-unit-integration.txt`).
- 225 della base v3.7.3.
- 3 test della base aggiornati per comportamento approvato:
  - `room.test.js`: 300/300 ex aequo con una Ø digitata a mano;
  - `content_import_podium_373.test.js`: a verdetto completo l'azione principale è TERMINA PARTITA;
  - `session_planner_370.test.js`: versione e stub di `missingGuard`.
- 25 nuovi in `tests/training_rc1.test.js`:

| Area | Che cosa verifica |
|---|---|
| Punteggio | 6 corrette a mano = 300 ×6; solo tablet = 300/275 per tempo; una sola risposta manuale (anche errata o 0 digitato) basta per l'ex aequo; le Ø automatiche non lo attivano; profilo Didattico invariato; server e regia producono gli stessi punti |
| Regia | griglia manuale → «CORRETTE EX AEQUO», senza ▲; tablet + MANCANTI = Ø → resta l'ordine del tempo misurato |
| Omissioni | annullando la 2ª di 4 manche, la squadra torna a 0 (prima restava −100); ordine di apertura, non di conferma; sono toccate solo le omissioni; con una riconferma tardiva server e regia coincidono |
| Avviso prima di Ø | nomi nell'avviso; il 2° AVANTI procede; giochi; **AVANTI vero (`nextQuestion`/`planNext`) in archivio e in scaletta**; nessun avviso se rispondono tutti |
| Classifica del round | legenda ex aequo quando ci sono risposte a mano |
| Photopuzzle | `cover` + `--focus` solo nel Photopuzzle; `photoFocus` (percentuali e parole, errori leggibili); Pack Studio → libreria → esporta → reimporta conserva il focus |
| Percorso docente | checklist, QR/PIN sullo SHOW, proiettore, TERMINA PARTITA (archivia, niente «partita non conclusa»), avvio senza tablet = stesso programma, testi, tre documenti e procedura di backup manuale |

**Controprova**: i due test «AVANTI vero» sono stati eseguiti anche sul codice precedente alla correzione dell'E2E: **2 falliti** (vedi § 4).

## 3. Simulazione multi-tablet [ESEGUITO]
`tools/simulate_players.js` (server reale, WebSocket), log in `QA/v1.0-rc1/simulation.txt`:

| Pulsantiere | Risposte | ack mediana | 95° perc. | max | Esito |
|---|---|---|---|---|---|
| 2 | 10 | 6 ms | 7 ms | 7 ms | ✓ |
| 6 | 30 | 4 ms | 8 ms | 9 ms | ✓ |
| 15 | 75 | 3 ms | 7 ms | 8 ms | ✓ |
| 30 | 150 | 3 ms | 7 ms | 9 ms | ✓ |

Nessuna risposta persa né duplicata. Dopo la simulazione `data/` contiene solo `LEGGIMI.txt`.

## 4. E2E nel browser [ESEGUITO · BROWSER]
Copia di lavoro separata con 3 pacchetti, 4 squadre e 2 tablet simulati (Blu, Rossi). Verdi e Gialli sono gestite a mano.

| # | Schermata / flusso | Esito |
|---|---|---|
| 1 | Home a 1366×768 e 1920×1080: lista «PRONTO PER LA LEZIONE» completa e leggibile; le righe passano a ✓ man mano (squadre, proiettore, 2/2 pulsantiere) | ✓ |
| 2 | Indicatore in alto: «PRONTO», versione solo nel suggerimento; titolo della scheda senza versione | ✓ |
| 3 | QR SUL PROIETTORE: `/show` a 1920×1080 mostra QR, indirizzo, PIN e «COLLEGATE 0/4 → 2/4»; il QR sparisce all'avvio del quiz | ✓ |
| 4 | Round solo tablet: «ORDINE DELLE CORRETTE (tempo misurato)», Blu +300 / Rossi +275 | ✓ |
| 5 | **Avviso senza risposta**: chip e pulsante principale con i nomi | ✓ |
| 6 | **Primo AVANTI**: alla prima prova passava alla domanda seguente senza confermare i punti → **difetto trovato e corretto** (vedi CHANGELOG § 6). Dopo la correzione: il 1° AVANTI resta sulla domanda, con l'avviso | ✓ dopo la correzione |
| 7 | 2° AVANTI: Ø per Verdi e Gialli (0 punti, astensioni gratuite) e classifica del round | ✓ |
| 8 | Round misto, tablet + Verdi B / Gialli D a mano: «CORRETTE EX AEQUO», Blu/Rossi/Verdi 1° con +300, Gialli −100; legenda ex aequo sullo SHOW (corretta dopo questa prova) | ✓ dopo la correzione |
| 9 | Pack Studio: campo «Punto focale»; «pippo» → errore leggibile; «alto» → anteprima `cover 50% 0%`; SALVA NELLA LIBRERIA → `games.json` contiene `"focus": "50% 0%"` | ✓ |
| 10 | Photopuzzle con foto verticale 270×373: regia e SHOW con `object-fit: cover; object-position: 50% 0%`; la foto riempie la cornice | ✓ |
| 11 | Avviso nei giochi: il 1° AVANTI si ferma sul gioco, il 2° registra le Ø e passa alla domanda | ✓ |
| 12 | Classifica finale: RIVELA IL 4°… ★ IL 1°, poi **✓ TERMINA PARTITA** con REPORT e HOME | ✓ |
| 13 | TERMINA PARTITA: promemoria del report non esportato, archiviazione e Home; dopo il ricaricamento **nessun** «partita non conclusa» e squadre presenti | ✓ |
| 14 | RIPRENDI a metà partita (dopo il ricaricamento) | ✓ |
| 15 | COPIA PER L'ASSISTENZA: file `…_copia_assistenza.json` e messaggio con la cartella Download | ✓ |
| 16 | Console del browser (regia e SHOW): nessun errore | ✓ |

**Osservazione non corretta** (esisteva già nella v3.7.3, fuori dal perimetro approvato): nel pannello laterale dello SHOW dei giochi, dopo RIVELA TUTTO, lo stato torna a «PRONTO».

## 5. Hardware reale [NON VERIFICABILE]
- Proiettore fisico: leggibilità, F11, finestra su secondo monitor, blocco dei popup con le impostazioni della scuola.
- Tablet veri sulla Wi-Fi scolastica (isolamento dei client, firewall di Windows al primo avvio).
- Avvio da ZIP con doppio clic su `AVVIA_IL_SECCHIONE.bat` / `AVVIA_SENZA_TABLET.bat` da parte di un docente (eseguito solo lo smoke test automatico del server, vedi § 6).
- Test del docente sconosciuto: `QA/CHECKLIST_DOCENTE_SCONOSCIUTO.md`, da eseguire prima del corso.

## 6. Pacchetto di consegna
Smoke test dallo ZIP estratto in una cartella con spazi: vedi il report di consegna.
