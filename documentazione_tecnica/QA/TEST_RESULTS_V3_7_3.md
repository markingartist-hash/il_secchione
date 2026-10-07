# Risultati test — v3.7.3 CONTENT IMPORT AND PODIUM REVEAL (5 ottobre 2026)

## Baseline (immutata)
- `Il_Secchione_v3.7.2_REVEAL_FIX_PORTABLE.zip`, SHA-256 `5661c38640128990bc87550a167222eb9a655ccc96f4610fcf2bbab9350fc598`, 54 043 285 byte.
- Estratta in `Desktop\BASELINE_v3.7.2_REVEAL_FIX` (copia immutata).
- `tools/verify_release.js`: 238/238 file corrispondenti.
- `node tests/run.js`: **213 superati, 0 falliti**. Questo è il numero iniziale registrato.

## Test automatici v3.7.3 (Node 24.19 portable incluso)
**225 superati, 0 falliti**: i 213 della baseline più 12 nuovi in `tests/content_import_podium_373.test.js`. Log: `QA/v3.7.3/tests-unit-integration.txt`.

Unica modifica ai test della baseline: il numero di versione atteso in `tests/session_planner_370.test.js` (3.7.2 → 3.7.3).

| Area | Test |
|---|---|
| Riconoscimento del file | export ARCHIVIO (elenco o `{questions}`), export GIOCHI (anche v3), pacchetto, scaletta, risultati/snapshot, sconosciuto, testo, null |
| Sostituzione giochi | solo i tipi presenti nel file; gli altri invariati; campi della sessione mista tolti; riepilogo per tipo; file vuoto = nulla |
| Id domande | esporta → reimporta: id originali senza prefisso `packId/` |
| Giochi su disco | sostituzione salvata nel pacchetto installato, versione aumentata, copia nel cestino, resta alla riapertura, domande intatte; nessuna copia parallela nel browser; pacchetto in sola lettura → copia del browser con **tutti** i tipi e runtime ricostruito |
| Domande su disco | 5 domande modificate sostituiscono le 72; riapertura; il backup reimportato ripristina le 72 |
| Cablaggio | pulsante e finestra, aiuti in ARCHIVIO e GIOCHI, IMPORTA di ARCHIVIO/GIOCHI e trascinamento passano da IMPORTA CONTENUTI, vecchi import rimossi, testi di conferma e backup |
| Blocchi e testi | bloccato con domanda/gioco in corso e in sessione mista; il riepilogo dice che cosa e dove; per i pacchetti nessun backup richiesto |
| Classifica finale | posizioni con pari merito; esiti solo dai round confermati e non annullati |
| Reveal | intro, una posizione per AVANTI (1…6), animata solo l'ultima, suono finale e log per il 1°, nessun passo oltre, AVANTI inerte a verdetto completo, oro/argento/bronzo/ex aequo |
| Varianti | ★ CLASSIFICA (evento del pulsante) = tutto subito; MOSTRA TUTTO; 12 squadre = podio 2–1–3 + colonne; nomi protetti; 3 squadre = layout grande |
| Regia | RIVELA come azione principale con articolo corretto ("L'11°", "IL 4°"), ★ per il 1°, HOME/REPORT a fine; collegamenti in `app.js`; fine archivio e fine scaletta = finale; recovery del punto del reveal |
| Animazioni | keyframes finali solo transform/opacity; movimento ridotto rispettato |

## Stress test (`tools/simulate_players.js`)
| Pulsantiere | Risposte | ack mediana | 95° perc. | max | Esito |
|---|---|---|---|---|---|
| 2 | 10 | 6 ms | 8 ms | 8 ms | ✓ |
| 6 | 30 | 5 ms | 9 ms | 10 ms | ✓ |
| 15 | 75 | 2 ms | 11 ms | 11 ms | ✓ |
| 30 | 150 | 3 ms | 8 ms | 9 ms | ✓ |

Nessuna risposta persa né duplicata (`QA/v3.7.3/simulation.txt`). Rete e protocollo non sono cambiati.

## Collaudo manuale e QA visivo
Import con i pacchetti reali (domande, giochi, ZIP trascinato, scaletta, risultati, file errati), backup, verifica su disco e riapertura. Classifica finale con 3, 6 e 12 squadre, nomi lunghi, pari merito, a 1366×768 e 1920×1080; tasti → rapidissimi; refresh dello SHOW durante il reveal; recovery. Dettagli: `QA/IMPORT_PODIUM_MANUAL_TEST.md`.

## Differenze rispetto alla baseline
`QA/v3.7.3/diff_vs_v3.7.2.patch`: 16 file.
- **Programma**: `js/app.js`, `js/engine/packlib.js`, `js/engine/roundControl.js`, `js/host/packs-ui.js`, `index.html`, `css/show.css`, `css/classroom.css`, `server/server.js` (solo versione).
- **Test**: il file nuovo e l'aggiornamento del numero di versione atteso.
- **Documenti**: changelog, README, guida, checklist, LEGGIMI.
