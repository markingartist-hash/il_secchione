# v3.5.2_PILOT — 4 ottobre 2026

Deriva esclusivamente da `Il_Secchione_v3.5.1_CLASSROOM_KEYBOARD_GIOCHI.zip`.

- Incluso Node portable Windows x64 con licenza; launcher BAT conservati.
- Confronto token UTF-8 resistente a lunghezze diverse in byte: elimina il crash remoto.
- Limite di output applicato durante la decompressione ZIP, in Node e nel browser.
- Ripristino dello stato INVIA al cambio manche; preservato il retry della stessa manche.
- Controlli Host/Origin contro richieste da domini estranei; restano validi localhost, indirizzi IP e nome del PC (anche .local).
- Migrazione dei vecchi pack: mantenuti i dati sorgenti quando l'importazione fallisce.
- Gestito l'errore dello stream HTTP: non termina l'intero server.
- Saluto SHOW idempotente e ruolo della connessione non modificabile dopo l'assegnazione (resta il rinnovo token Player).
- I saluti Player falliti conservano il limite di frequenza e il timeout di ingresso.
- Chiusura del socket WebSocket anche alla fine del flusso TCP, senza lasciare connessioni pendenti.
- Allineata la versione dichiarata da HOST e server.
- Aggiunti 13 test di regressione, suite E2E Playwright di sviluppo, log QA, inventario e checksum.
- Aggiornate le istruzioni di avvio per il runtime incluso.

UI, CSS, HTML, contenuti, regole di punteggio, formati di salvataggio, report e giochi rimangono quelli della build allegata. Nessuna migrazione a SQLite, React, TypeScript o altro backend.
