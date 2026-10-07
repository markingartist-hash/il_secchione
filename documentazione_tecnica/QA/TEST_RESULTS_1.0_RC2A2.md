# Risultati dei test · 1.0 RC2-A.2 GAMEPLAY

**Ambiente**: container cloud Linux, Node v22.22.0 (non il Node 24 portatile per Windows della distribuzione), Chromium di Playwright 1.56.1 headless.

## 1. Suite automatica — `node tests/run.js`
| | Superati | Falliti |
|---|---|---|
| Baseline RC2-A.1 (prima di iniziare) | 282 | 0 |
| RC2-A.2 | **307** | **0** |

25 nuovi test in `tests/rc2a2_gameplay.test.js` (A–G della richiesta, più intro, risultato del gioco e testi). I test della base aggiornati per comportamento approvato sono elencati nel changelog.

## 2. Simulatore di rete — `node tools/simulate_players.js`
| Pulsantiere | RC2-A.1 (baseline, stesso ambiente) | RC2-A.2 |
|---|---|---|
| 2 | 10 risposte · ack mediana 1 ms, max 3 ms · 441 ms | 10 risposte · ack mediana 1 ms, max 7 ms · 478 ms |
| 6 | 30 risposte · mediana 1 ms, max 2 ms · 514 ms | 30 risposte · mediana 1 ms, max 1 ms · 455 ms |
| 15 | 75 risposte · mediana 0 ms, max 3 ms · 759 ms | 75 risposte · mediana 1 ms, max 2 ms · 793 ms |
| 30 | 150 risposte · mediana 0 ms, max 1 ms · 1155 ms | 150 risposte · mediana 1 ms, max 1 ms · 992 ms |

In entrambi i casi: nessuna risposta persa, nessun duplicato. Le differenze sono rumore di misura.

Il simulatore prova solo domande A/B/C/D. I micro-round dei giochi (coppie A/B, parole) passano dallo stesso `round.commit` e sono verificati dai test del server in `rc2a2_gameplay.test.js`: voto reale di un tablet, commit di coppie, parole e finale, riavvio del server.

File: `v1.0-rc2a2/simulation_RC2A1_baseline.txt`, `v1.0-rc2a2/simulation_RC2A2.txt`.

## 3. QA visiva del palco — `tests/e2e/visual_games.cjs` (eseguita davvero)
- **Configurazione**: server reale su una copia dell'app, regia `/host` con 6 squadre (una con nome lungo) e quattro `/show` a **1366×768, 1600×900, 1920×1080, 1024×768 (4:3)**.
- **Per ogni gioco** (Photopuzzle, Indovina, Abbinamenti, Ghigliottina con 5 coppie e finale, Staffetta con tutte le parole) sono state catturate intro, gioco in corso, soluzione e risultato del gioco: 84 schermate, **0 testi tagliati o fuori dal palco, 0 errori JavaScript**.
  - Il controllo automatico cerca ogni elemento con testo che esce dal palco o è tagliato dal suo riquadro.
  - Ho guardato le schermate anche una per una.
- **Difetti trovati e corretti durante la QA**:
  - la cronologia degli indizi era tagliata da un vecchio `max-height`;
  - i nomi dei candidati si spezzavano a metà;
  - la parola finale della Ghigliottina restava al minimo per 3 px di interlinea;
  - nel risultato i nomi delle squadre (anche nel risultato delle domande) tagliavano di 3 px le lettere con la gamba.
- **Evidenze** in `v1.0-rc2a2/`:
  - `show_giochi_<risoluzione>.jpg`: tutte le schermate di una risoluzione;
  - alcune schermate a 1366×768 a piena grandezza;
  - due schermate «PRIMA» della RC2-A.1 per confronto;
  - `visual_report.json`: misure del testo in % dell'altezza per ogni schermata.
- La regia è stata comandata con `window.__secchioneDebug` e le risposte inserite a mano: è una prova del palco, non del flusso dei tablet (coperto dalla suite e dalla prova tastiera).

## 4. Tastiera con cursore — `tests/e2e/keyboard_caret.cjs` (eseguita davvero)
- **Configurazione**: pulsantiera reale (Chromium con emulazione touch, 390×844) collegata con PIN e approvazione; Indovina apre il round testuale.
- **13 verifiche superate**, solo con tocchi sui tasti e sul campo:
  - inserimento alla fine, all'inizio e in mezzo;
  - correzione di una lettera nel mezzo senza perdere il resto (LA ROMA → LA ROSA);
  - selezione sostituita (accento compreso);
  - ⌫ su selezione;
  - apostrofo e frase intera;
  - tasti ≥ 44 px;
  - rotazione in orizzontale (844×390) con testo e cursore conservati;
  - testo lungo con scorrimento fino al cursore;
  - limite di caratteri;
  - INVIA ricevuto dalla regia come risposta corretta.
- **Difetto trovato e corretto**: dopo INVIA con il campo a fuoco la pulsantiera restava su «INVIO…».
- **Evidenze**: `v1.0-rc2a2/kb_*.png`, `keyboard_report.json`.

## 5. Non verificato (dichiarato)
- **Dispositivi**: proiettore reale, leggibilità dal fondo dell'aula, iPad/Safari, Android reali e tablet vecchi.
  - `inputmode="none"` è stato provato solo in Chromium; su Safari/iOS vecchi può comparire la tastiera di sistema, che funziona comunque ma copre parte dello schermo.
  - La rotazione è stata provata cambiando le dimensioni della finestra, non ruotando un dispositivo.
- **Finestra popup del proiettore aperta dalla regia**: non provata nel browser automatico, per lo stesso limite della RC2-A sui popup. È stato provato `/show`, che usa lo stesso HTML, CSS e `stage-fit.js`.
- **Altri pacchetti**: le schermate usano il pacchetto incluso Arte romana. Contenuti molto più lunghi di altri pacchetti sono gestiti dal fit (testo al minimo e classe `tooLong`), ma non sono stati fotografati.
- **Runtime Windows**: Windows, `runtime/node.exe` (Node 24) e lo ZIP portatile non sono disponibili qui.
  - `SHA256SUMS.txt` non è stato rigenerato: già nella baseline del repository non corrisponde (mancano `runtime/` e i suoni HQ, fine riga normalizzati da git). Va rigenerato quando si costruisce lo ZIP.
- **E2E storico `tests/e2e/run.cjs`**: non eseguito. Richiede Chrome (channel `chrome`), non presente, e si aspetta ancora i punti 300/275 dei profili precedenti alla RC2-A.
