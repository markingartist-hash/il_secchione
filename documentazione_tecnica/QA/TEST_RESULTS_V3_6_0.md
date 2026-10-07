# Risultati test — v3.6.0 CLASSROOM CONTROL (5 ottobre 2026)

## Stato iniziale (baseline immutata)
- `Il_Secchione_v3.5.4_ANSWER_MATCHER_PORTABLE.zip`, SHA-256 `123cdd1ae63f6b8c78b904a50ac6c3bcff19038f475274ea4441d85186ef4484`, 54 777 243 byte.
- `tools/verify_release.js`: 208/208 file corrispondenti.
- `node tests/run.js`: **165 superati, 0 falliti**.
- `tools/simulate_players.js`: 2/6/15/30 pulsantiere OK.

## Test automatici v3.6.0 (Node 24.19 portable incluso)
**182 superati, 0 falliti**: i 165 della baseline, invariati e non modificati, più 17 nuovi in `tests/classroom_control.test.js`. Log: `QA/v3.6.0/tests-unit-integration.txt`.

| Area richiesta | Test |
|---|---|
| Modifica della domanda corrente | in anteprima: qIndex, squadre, punteggi e sessione invariati, risposta corretta ricalcolata nello stesso ordine; **codice reale di `app.js`**: salvataggio nel pacchetto installato su disco (nessun override), riavvio (nuova libreria), export ZIP con la modifica, versione aumentata, copia nel cestino, ripiego nel browser per i pacchetti in sola lettura |
| Round in corso | "salva per dopo" lascia intatti round e risposte, la modifica entra lasciando la domanda; "salva e riavvia" elimina solo il round corrente, anteprima aggiornata |
| Annulla | nessun punto, risposte del round eliminate, sessione e squadre preservate, domanda nel pacchetto; `app.js`: round chiuso sui tablet, conferma obbligatoria; server: risposte tardive rifiutate (`round_closed`), round rilanciato pulito con la risposta corretta aggiornata |
| Ripeti | nuovo round pulito, punteggi invariati, `repeatOf`; nessun round da chiudere se già confermato |
| Navigazione | uscire da una domanda avviata senza risposte chiede conferma e chiude il round (niente round fantasma) |
| acceptedAnswers | crea, modifica, elimina, riordina, vuoti e doppioni normalizzati ignorati, principale distinta, Staffetta per collegamento; salva → riavvio → export → elimina → reimporta → riapertura nello Studio; l'answerMatcher le accetta (`accepted_variant`) |
| Connessioni | indicatore 3/3 → 2/3 con nome e "da N s" → 3/3, squadre non eliminate, squadre manuali a parte; server: pulsantiera disconnessa resta assegnata, `lastSeen` presente, riconnessione con token |
| Ricerca | testo (accenti ignorati) in domanda, alternative e spiegazione; argomento, difficoltà, tag; valori dei filtri dai dati |
| Progresso | corrente, totale, giocate, da giocare |
| Ghigliottina sui tablet | round A/B (`mcq`, lettere A/B, nessun esito); voti contati; maggioranza automatica; parità → docente; il voto non è una risposta da punteggio; server: tasti A/B al tablet, voto inoltrato senza esito |
| Recovery | SHOW che si ricollega riceve palco e timer correnti; istantanea della regia salvata e riletta sul server con la versione giocata del round aperto; tablet che si ricollega (anche test della baseline) |

## Stress test (`tools/simulate_players.js`)
| Pulsantiere | Risposte | ack mediana | 95° perc. | max | Esito |
|---|---|---|---|---|---|
| 2 | 10 | 7 ms | 9 ms | 9 ms | ✓ |
| 6 | 30 | 3 ms | 7 ms | 8 ms | ✓ |
| 15 | 75 | 2 ms | 11 ms | 12 ms | ✓ |
| 30 | 150 | 3 ms | 8 ms | 9 ms | ✓ |

Nessuna risposta persa né duplicata. Nessuna regressione significativa rispetto alla baseline (30 pulsantiere: max 5 ms → 9 ms, sempre sotto i 10 ms; la simulazione gira in loopback).

## Collaudo manuale
Scenario completo dei 29 passi più il recovery durante un round aperto: `QA/CLASSROOM_CONTROL_MANUAL_TEST.md`.

- **Browser**: Chromium 152.0.7977.130 (pannello browser dell'app Claude).
- **Non eseguiti**: Chrome ed Edge installati e la suite Playwright `tests/e2e/`, che richiede Playwright, non installato. Stesso motore Chromium, ma non verificati separatamente.

## Smoke test dallo ZIP, fuori dalla cartella di sviluppo
Lo ZIP candidato, identico al finale salvo questo documento e `SHA256SUMS.txt`, è stato estratto con l'estrazione nativa di Windows (`Expand-Archive`) in una cartella nuova con spazi nel percorso (`%TEMP%\smoke 360 nuova\`) e avviato da lì col proprio Node.

- `runtime\node.exe --version` → v24.19.0; `tools\verify_release.js` → 216/216; `tests\run.js` → **182 superati, 0 falliti**; `data\` contiene solo `LEGGIMI.txt`.
- Server avviato dalla cartella estratta (intestazione "IL SECCHIONE v3.6.0"). Risposte HTTP: `/index.html`, `/studio`, `/show`, `/player`, `js/engine/roundControl.js`, `js/engine/packstudio.js` e la mascotte → 200; `/` → 302 verso la regia.
- **Regia**:
  - titolo "v3.6.0";
  - ✎ MODIFICA DOMANDA in anteprima → resta la domanda 1, "✓ Modifica salvata";
  - AVVIA, poi ✕ ANNULLA → anteprima, "✓ Round annullato";
  - ricerca "arco" → 14 di 72;
  - progresso "Domanda 1 / 72 · giocate 0 · da giocare 72".

Nessun riferimento alla cartella di sviluppo. Lo ZIP finale viene riverificato dopo la creazione (vedi messaggio di consegna).
