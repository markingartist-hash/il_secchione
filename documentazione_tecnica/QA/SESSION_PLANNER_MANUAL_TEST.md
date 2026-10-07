# Collaudo realistico — v3.7.0 SESSION PLANNER (5 ottobre 2026)

## Ambiente
- **Build**: copia di lavoro della v3.7.0, avviata col Node 24.19 portable incluso; server su `127.0.0.1:8797` con dati a parte. La cartella della release resta pulita.
- **Browser**: Chromium 152.0.7977.130, il pannello browser dell'app Claude. Le `confirm()` native venivano accettate via script, perché il pannello non mostra le finestre di dialogo; i pulsanti premuti sono quelli veri della regia.
- **Pacchetti reali**: `SECCHIONE_BAROCCO_3MEDIA_v1.1.0` e `SECCHIONE_PREISTORIA_1MEDIA_v1.1.0`, da `PACCHETTI_SECCHIONE_TRIENNIO_v1.1.0.zip`, più Arte romana del programma.
- **6 pulsantiere**: client WebSocket veri, con lo stesso protocollo del tablet, guidati da uno script esterno alla build e assegnati alle squadre 3A–3F dal dialogo PULSANTIERE della regia. Rispondono da soli: lettere sulle domande, voto A/B (4 B, 2 A), testo nei giochi scritti.

## Parte 1 — Scaletta "Barocco 3B · verifica" (4 squadre, risposte registrate a mano)

| # | Passo | Esito |
|---|---|---|
| 1 | 📋 SCALETTA senza scalette salvate | ✓ spiegazione e ＋ NUOVA |
| 2 | ＋ NUOVA, nome, solo Barocco spuntato | ✓ 30 domande · 10 giochi; anteprima con tipo, pacchetto, difficoltà, argomento |
| 3 | Aggiunte 5 domande e 3 giochi (Parola segreta, Indovina, Staffetta) alternati | ✓ "✓ salvata alle …"; i contenuti già inseriti mostrano "✓ in scaletta" e non hanno ＋ |
| 4 | Trascinamento del 4° elemento sul 2° | ✓ ordine aggiornato (eventi `dragstart/dragover/drop`: il trascinamento sintetico del pannello non genera il drag & drop nativo) |
| 5 | ↓ due volte, ⧉ sul primo | ✓ copia subito dopo, marcata "ripetizione" |
| 6 | ▶ AVVIA SCALETTA | ✓ finestra chiusa, **DOMANDA 1 / 6**, chip "📋 Barocco 3B · verifica · 1 / 9", azione principale **▶ AVVIA DOMANDA** |
| 7 | Refresh della regia → RIPRENDI | ✓ stessa scaletta, stesso elemento; "▶ RIPRENDI SCALETTA" disattivato perché si è già sull'elemento |
| 8 | AVVIA → 2 risposte a mano → RIVELA | ✓ azione principale **AVANTI →** con "poi: …"; secondarie ↶ ANNULLA ULTIMA, ↺ RIPETI, ✕ ANNULLA ROUND, ✎ MODIFICA; chip "✍ Risposte 2 / 4" |
| 9 | AVANTI | ✓ punti registrati (Blu +300, Rossi −100, Ø agli altri); il duplicato apre un **round nuovo** e pulito della stessa domanda |
| 10 | SALTA → AVVIA, RIVELA, AVANTI senza risposte → SALTA | ✓ esiti `skipped`/`played`; compare **Ø gratis: Verdi 1 · Gialli 1** (solo ora che serve) |
| 11 | Parola segreta: ▶ AVVIA → SCEGLI A/B × 5 → finale | ✓ A/B come azione principale; pulsanti disattivati durante l'animazione; in finale **● RIVELA PAROLA FINALE** con ⏸ PAUSA e +10 s |
| 12 | 1 risposta giusta, RIVELA, ↶ ANNULLA ULTIMA, di nuovo giusta, AVANTI | ✓ annullamento corretto; AVANTI conferma i punti del gioco (mancanti = Ø) e apre la domanda successiva |
| 13 | Domanda: AVVIA, ⏸ PAUSA, ▶ RIPRENDI, +10 s, ■ CHIUDI TEMPO, RIVELA, AVANTI | ✓ comandi contestuali corretti in ogni fase |
| 14 | Domanda: AVVIA → ✕ ANNULLA ROUND → AVVIA → RIVELA → AVANTI | ✓ anteprima dopo l'annullamento, poi round regolare |
| 15 | Indovina: AVVIA, + INDIZIO, ELIMINA 2, RIVELA, AVANTI senza risposte | ✓ chiede "proseguire senza punti?", nessun punto assegnato |
| 16 | Staffetta: AVVIA, + LETTERA, SOLUZIONE → **PAROLA SUCCESSIVA** ×2 → ★ FINE SCALETTA | ✓ ogni parola registrata; a fine scaletta CLASSIFICA con **⌂ HOME** e **📄 REPORT DI CLASSE** |
| 17 | Dati salvati | ✓ `session.plans[0]`: 9 elementi con `packId`, `packVersion` 1.1.0, `sourceQuestionId` o gioco ed esito; 8 round con `planItem`. Le scalette sono nelle preferenze |

**Difetto trovato e corretto**: il duplicato saltato lasciava attivo `repeatOf`, e la domanda successiva risultava "ripetizione". Ora `goQuestion` lo azzera; il difetto era già presente nella v3.6.1 con RIPETI seguito da →. Sono stati corretti anche altri tre difetti:
- il pulsante PAUSA restava "RIPRENDI" all'avvio automatico della finale;
- il chip "Risposte 0/6" compariva durante il voto A/B;
- spuntando un elemento, l'elenco tornava in cima.

## Parte 2 — Scaletta mista con 6 pulsantiere (squadre 3A–3F)

| # | Passo | Esito |
|---|---|---|
| 1 | Nuova partita, 6 squadre, 6 pulsantiere assegnate | ✓ **📱 6 / 6 COLLEGATE** |
| 2 | ＋ NUOVA "Ripasso misto 3B": Barocco + Preistoria, ricerca "grotta", filtro difficoltà 2, Parola segreta · Caravaggio, Indovina (Preistoria) | ✓ 4 elementi da 2 pacchetti |
| 3 | ▶ AVVIA SCALETTA | ✓ **SESSIONE MISTA** attivata da sola: "In gara: Preistoria + Barocco"; 6 squadre e 6/6 pulsantiere intatte; DOMANDA 1 / 2 |
| 4 | AVVIA domanda 1 | ✓ 6 risposte dai tablet ("✍ Risposte 6 / 6"), RIVELA, punti registrati da soli |
| 5 | Domanda 2, poi Parola segreta | ✓ voto A/B dei tablet: scelta automatica a maggioranza, coppia dopo coppia; nessun contatore di risposte durante il voto |
| 6 | Finale scritta | ✓ 6/6 risposte "Caravaggio"; answerMatcher: **✓ GIUSTA**, 0,4 s; punti con AVANTI |
| 7 | Indovina (Preistoria), RIVELA, ★ FINE SCALETTA | ✓ classifica finale; squadre 3A–3F con i punti attesi |
| 8 | SHOW su `/show` | ✓ stesso palco con la numerazione della scaletta ("DOMANDA 5 / 6") |

## Parte 3 — Contenuti mancanti, uscita, ripresa

| # | Passo | Esito |
|---|---|---|
| 1 | IMPORTA un file `.json` con: domanda vera, domanda cancellata, pacchetto non installato, manche rinominata, gioco vero, elemento illeggibile | ✓ "importata (1 elemento illeggibile scartato)"; 3 elementi **MANCANTE** in rosso con il motivo, al loro posto e non sostituiti; riepilogo "3 mancanti" |
| 2 | ▶ AVVIA SCALETTA | ✓ conferma "3 elementi … verranno saltati"; DOMANDA 1 / 1, poi direttamente il gioco (2 / 2) |
| 3 | ✕ nel chip della scaletta | ✓ "Scaletta interrotta: squadre e punti restano"; poi → e PROSSIMA seguono l'archivio ("DOMANDA 1 / 30") |
| 4 | Refresh in ogni fase (domanda, gioco, classifica) | ✓ "PARTITA NON CONCLUSA TROVATA" → RIPRENDI → scaletta e posizione ripristinate |

## QA visivo della regia e della finestra SCALETTA

Misure fatte nella pagina vera: i pulsanti della regia stanno dentro la colonna, nessun testo è tagliato e non c'è scorrimento orizzontale.

| Risoluzione | Regia (domanda / gioco) | Finestra SCALETTA |
|---|---|---|
| 1920×1080 | ✓ regia 381 px, azione principale 340×54, aiuto testuale visibile | ✓ |
| 1366×768 | ✓ regia compatta (280 px), azione principale 300×60, griglia risposte in vista | ✓ AVVIA SCALETTA in alto |
| 1280×720 | ✓ domanda e voto A/B (due pulsanti affiancati con i voti) | ✓ |
| 1024×768 | ✓ layout della baseline: regia nella colonna sotto il palco; chip scaletta con ✕ sempre visibile | ✓ due colonne, AVVIA/RICOMINCIA in alto |

**Console**: nessun errore dopo le correzioni. Gli unici due errori registrati risalgono al primo caricamento, prima della rimozione di un riferimento a un pulsante tolto.

## Non eseguito
- Tablet fisici: le 6 pulsantiere sono client WebSocket con lo stesso protocollo.
- Chrome ed Edge installati e la suite Playwright `tests/e2e/`, che richiede Playwright, non installato. Stesso motore Chromium, ma non verificati separatamente.
- Drag & drop con mouse reale: verificato con eventi `DragEvent` nella pagina vera; SU/GIÙ con clic veri.
