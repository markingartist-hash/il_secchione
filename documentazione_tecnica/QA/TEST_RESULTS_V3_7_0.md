# Risultati test — v3.7.0 SESSION PLANNER (5 ottobre 2026)

## Stato iniziale (baseline immutata)
- `Il_Secchione_v3.6.1_CLASSROOM_FLOW_PORTABLE.zip`, SHA-256 `5787426284b0ecd4dc66eeeb1e389a2782b67774f28adde4938b10462e18609c`, 53 924 225 byte.
- `tools/verify_release.js`: 222/222 file corrispondenti.
- `node tests/run.js`: **190 superati, 0 falliti**.
- `tools/simulate_players.js`: 2/6/15/30 pulsantiere OK.

## Test automatici v3.7.0 (Node 24.19 portable incluso)
**208 superati, 0 falliti**: i 190 della baseline, invariati e non modificati, più 18 nuovi in `tests/session_planner_370.test.js`. Log: `QA/v3.7.0/tests-unit-integration.txt`.

| Area | Test |
|---|---|
| Riferimenti | gli elementi hanno `packId`/`questionId`/`sourceQuestionId`/`packVersion` o `packId`/tipo/titolo/occorrenza; nessun campo di contenuto copiato (alternative, soluzione, indizi, immagini…) |
| Duplicati | nessuna duplicazione silenziosa (domande e manche); duplicazione esplicita con nuovo `uid` e `duplicateOf` subito dopo l'originale |
| Ordine | SU/GIÙ, oltre i limiti, rimozione; mescola solo le domande con i giochi fermi e lo stesso insieme di domande |
| Mancanti | domanda eliminata, manche rinominata, pacchetto non installato: in elenco, al loro posto, con il motivo, mai sostituiti; anteprima aggiornata se il contenuto è stato modificato |
| Giochi | occorrenza tra manche con lo stesso titolo; sessione mista con `_packId`; nessun ripiego su un'altra manche |
| Salvataggio | esporta → importa identico; file non validi rifiutati; elementi illeggibili contati; id qualificati; aggiornamento e unione browser/server (vince la più recente) |
| In classe (modello) | AVANTI salta i mancanti; posizione *n / n*; record di sessione con pacchetto, versione ed esito |
| Report | sezione Scaletta con contenuto, pacchetto, versione ed esito, titolo protetto; nessuna sezione senza scaletta |
| Regia one screen | una sola azione principale per fase: AVVIA → RIVELA → PROSSIMA/AVANTI, ★ CLASSIFICA/FINE SCALETTA; home, ripresa, fine scaletta; tutti i giochi (avvio, aiuti disattivati quando finiti, voto A/B con conteggi, finale, parola successiva, ripeti/annulla) |
| Nessun doppione | in ogni fase nessuna azione due volte, id unici, ogni azione corrisponde a una funzione di `app.js`; gli id storici dei comandi non esistono più come pulsanti fissi in `index.html`, né nella scheda GIOCHI |
| Ø | il mini indicatore compare solo se a una squadra resta al massimo 1 astensione gratuita |
| `app.js` in sandbox | AVVIA SCALETTA → domanda → gioco (preset giusto, punti con AVANTI) → domanda saltata → duplicato con round nuovo (`repeatOf`) → mancante saltato → classifica; esiti; deviazione dall'Archivio non attribuita e ritorno all'elemento; INDIETRO senza round nuovo; gioco senza risposte (con e senza conferma); contenuto sparito durante la lezione; RIPRENDI da HOME; rifiuto con meno di 2 squadre o senza contenuti |
| Cablaggio | ordine degli script, finestra e pulsante, `plans` nelle preferenze, `planRun` nell'istantanea e nella ripresa, `planItem` nei round, AVANTI = `nextQuestion`, `repeatOf` azzerato al cambio domanda, nuova partita, versione |
| Server | le scalette salvate nelle preferenze tornano da `GET /api/host/prefs`; senza chiave della regia → 403 |

## Stress test (`tools/simulate_players.js`)
| Pulsantiere | Risposte | ack mediana | 95° perc. | max | Esito |
|---|---|---|---|---|---|
| 2 | 10 | 2 ms | 7 ms | 7 ms | ✓ |
| 6 | 30 | 2 ms | 5 ms | 5 ms | ✓ |
| 15 | 75 | 2 ms | 4 ms | 4 ms | ✓ |
| 30 | 150 | 2 ms | 3 ms | 4 ms | ✓ |

Nessuna risposta persa né duplicata (`QA/v3.7.0/simulation.txt`). Server, protocollo e Player non sono cambiati.

## Collaudo manuale e QA visivo
Scenario completo con i pacchetti reali Barocco e Preistoria v1.1.0, 6 pulsantiere WebSocket, scaletta mista, contenuti mancanti, uscita e ripresa. QA visivo a 1920×1080, 1366×768, 1280×720 e 1024×768. Dettagli: `QA/SESSION_PLANNER_MANUAL_TEST.md`.

## Differenze rispetto alla baseline
`QA/v3.7.0/diff_vs_v3.6.1.patch`: 16 file, cioè 9 file di programma (2 nuovi), 1 file di test nuovo e i documenti.
- **Invariati**: answerMatcher, scoring, session, packs/packlib, room, ws e il resto di `server/` (salvo il numero di versione), Player, SHOW, mascotte e pacchetti.
