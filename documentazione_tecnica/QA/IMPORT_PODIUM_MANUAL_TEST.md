# Collaudo manuale — v3.7.3 CONTENT IMPORT AND PODIUM REVEAL (5 ottobre 2026)

## Ambiente
- **Build**: copia di lavoro della v3.7.3 col Node 24.19 portable incluso; server su `127.0.0.1:8799` con dati a parte. La cartella della release resta pulita.
- **Pacchetti reali**: `SECCHIONE_BAROCCO_3MEDIA_v1.1.0` e `SECCHIONE_PREISTORIA_1MEDIA_v1.1.0`, più `PACK_ESEMPI/inglese_base.zip`.
- **Browser**: Chromium 152.0.7977.130, il pannello browser dell'app Claude, con regia e SHOW (`/show`) in due schede.
- **Download**: i download (export e backup) venivano intercettati via script per leggerne il contenuto, senza scrivere nella cartella Download. Le `confirm()` native erano accettate via script, perché il pannello non mostra le finestre di dialogo. I pulsanti sono quelli veri della regia.

## Importa contenuti (pack attivo: Barocco, 30 domande)

| # | Passo | Esito |
|---|---|---|
| 1 | 📥 IMPORTA CONTENUTI | ✓ finestra con i 4 tipi riconosciuti e SCEGLI IL FILE |
| 2 | ARCHIVIO → ESPORTA (30 domande); file modificato: prime 5, la 1ª con testo nuovo → selezionato | ✓ "Hai selezionato un archivio domande (.json): 5 domande. Verranno sostituite le 30 domande del pack attivo: Barocco · Bernini e Caravaggio", anteprima delle prime 3, avviso "Sostituzione, non unione" |
| 3 | ⬇ ESPORTA BACKUP PRIMA DI CONTINUARE | ✓ backup `backup_domande_barocco_3media_<data>.json` con 30 domande, poi "✓ Hai importato 5 domande nel pack attivo…", ARCHIVIO = 5. **Su disco**: pacchetto v1.1.1, 5 domande, id originali (`barocco_3media_q001`), copia nel cestino |
| 4 | Il backup reimportato dal pulsante IMPORTA di ARCHIVIO → CONTINUA SENZA BACKUP | ✓ "Verranno sostituite le 5 domande…", poi 30 domande |
| 5 | Chiudi e riapri (ricarica la regia) | ✓ ARCHIVIO = 30, pack ancora attivo |
| 6 | GIOCHI → ESPORTA GIOCHI (2 per tipo); file con una sola Staffetta → IMPORTA GIOCHI | ✓ tabella: Photopuzzle 2→2 *resta*, …, Staffetta 2→1 *sostituito* |
| 7 | CONTINUA SENZA BACKUP | ✓ importazione riuscita; la prova mostrava "1 giochi", plurale corretto subito dopo ("1 gioco"). **Su disco**: v1.1.3, chain 1 «Staffetta reimportata», altri tipi 2, nessun campo `_pack…` |
| 8 | Reimport dell'export completo da 📥 | ✓ "Hai importato 10 giochi nel pack attivo"; su disco 2 per tipo (v1.1.4) |
| 9 | `inglese_base.zip` **trascinato** sulla regia | ✓ si apre IMPORTA CONTENUTI, non la schermata Pacchetti; "Hai selezionato un pacchetto completo… Verrà installato nella libreria pacchetti"; INSTALLA → "✓ Pacchetto installato correttamente · «Inglese di base»: 6 domande, 3 manche", ● ATTIVA ORA |
| 10 | Stesso ZIP di nuovo | ✓ "Questo pacchetto è già installato · nessuna modifica" |
| 11 | Scaletta `.json` | ✓ riconosciuta, "Scaletta «Ripasso importato» aggiunta" |
| 12 | JSON completo dei risultati | ✓ "è un file di risultati / partita… non un contenuto da importare" |
| 13 | JSON sconosciuto, `.txt`, archivio domande non valido | ✓ messaggi distinti ("domanda 1: servono esattamente 4 alternative"); nulla modificato |

## Classifica finale

| # | Passo | Esito |
|---|---|---|
| 1 | 6 squadre, una col nome lungo e due sempre astenute (pari merito); scaletta di 3 domande giocata fino in fondo | ✓ a fine scaletta **CLASSIFICA FINALE · Ecco il verdetto**, "6 squadre in gara · si parte dal 5° posto"; regia: **▶ RIVELA IL 5° POSTO · 0 di 6 rivelati**, MOSTRA TUTTA LA CLASSIFICA |
| 2 | AVANTI × 6 | ✓ una posizione per volta dal basso; posti coperti "?" al loro posto; pari merito: due volte 5° con EX AEQUO; poi **★ RIVELA IL 1° POSTO** (pulsante giallo); infine ⌂ HOME e 📄 REPORT |
| 3 | SHOW a 1920×1080 | ✓ nessuna sovrapposizione né carta fuori scena; nomi interi (dopo una correzione dell'interlinea che tagliava i discendenti); nome 40 px, punti 52 px, statistiche 20 px |
| 4 | 12 squadre (nome lungo, pari merito all'11°) | ✓ podio 2–1–3 in alto, altre in 2 colonne; "▶ RIVELA L'11° POSTO" (articolo corretto dopo questa prova) |
| 5 | → premuto 5 volte di fila senza pause | ✓ esattamente 5 posizioni rivelate, nessun passo perso o doppio; animata solo l'ultima carta |
| 6 | Refresh dello SHOW a reveal in corso (5 di 12) | ✓ stesso stato: 5 rivelate, 7 coperte |
| 7 | Fine reveal a 12 squadre, SHOW a 1920×1080 e 1366×768 | ✓ 0 sovrapposizioni a riposo (solo durante l'ingrandimento del vincitore, per meno di un secondo); a 1366×768 le statistiche delle colonne compatte erano 9 px, portate a 1,5cqh |
| 8 | 3 squadre, pari merito al 2° | ✓ carte grandissime (nome 51 px, punti 66 px a 1366×768); "▶ RIVELA IL 2° POSTO" due volte, poi ★ |
| 9 | Refresh della regia a verdetto completo → RIPRENDI | ✓ CLASSIFICA FINALE, stesso verdetto |
| 10 | ★ CLASSIFICA a metà partita | ✓ titolo "CLASSIFICA", tutte le squadre subito, nessuna carta coperta |

**Console**: nessun errore.

## Non eseguito
- Proiettore reale (resta consigliato per la taratura finale).
- Chrome ed Edge installati e Playwright: stesso motore Chromium, non verificati separatamente.
