# CHANGELOG v3.5 CLASSROOM (3 ottobre 2026)


## Hotfix v3.5.1 — Pulsantiera tastiera nei giochi

- Le pulsantiere web ora partecipano anche alle manche speciali a risposta aperta.
- PhotoPuzzle, Indovina, Abbinamenti e Catena aprono automaticamente una risposta testuale sul tablet.
- Nella fase finale di Parola Segreta/Ghigliottina la pulsantiera passa alla tastiera quando compare la parola finale.
- Il Player usa una tastiera virtuale alfanumerica interna (lettere, numeri, accenti, spazio, apostrofo, trattino, cancella), senza mostrare la domanda sul tablet.
- La risposta resta modificabile fino a **INVIA**; dopo l'invio è definitiva come nelle domande normali.
- Il server registra testo, tempo e ordine di arrivo e calcola un primo esito automatico; il docente può sempre correggere GIUSTA/ERRATA prima di confermare i punti.
- Le risposte tablet dei giochi vengono conservate nei dati grezzi e negli export, separate dal punteggio.
- Pausa, +10 s, scadenza, reveal e riconnessione sincronizzano anche il round dei giochi.
- Aggiunti test server per le risposte testuali arcade; suite: **93 test superati**.

Base: `Il_Secchione_ARTE_ROMANA_v3.0.zip`, che non è stato modificato. Audit iniziale in [CURRENT_STATE.md](CURRENT_STATE.md).

Legenda: **TESTATO** = coperto da test automatici e/o provato nel browser durante lo sviluppo · **IMPLEMENTATO** = scritto ma senza un test dedicato · **PARZIALE** = funziona con limiti dichiarati · **NON IMPLEMENTATO**.

Ambiente di prova: Windows 10, browser Chromium integrato, Node 8.16 e Node 24.21. **Non** sono stati usati tablet fisici né il Wi-Fi della scuola: vedi le voci ⬜ di [TEST_CHECKLIST.md](TEST_CHECKLIST.md).

---

## Aggiornamento: Gestore Pacchetti

Il **motore di gara non è stato modificato**: `js/engine/scoring.js`, `timer.js`, `session.js`, `server/room.js` e `server/ws.js` sono identici byte per byte alla versione precedente (verificato con SHA-256). Il gestore lavora a fianco del motore: fornisce contenuti validati e la loro provenienza.

### TESTATO
- **Importazione con un solo gesto** di un `.zip` (pack.json, questions.json, games.json e images/ facoltativi): pulsante IMPORTA PACCHETTO, trascinamento del file sulla regia, `IMPORTA_PACCHETTO.bat` e `node tools/pack_manager.js import`. Domande, giochi e immagini si installano insieme. Accettati anche gli zip creati da Windows e i pack `.json` in file singolo (le immagini incorporate diventano file).
- **Validazione completa** prima di installare: dati, immagini citate presenti, firma dei file immagine, niente SVG, niente percorsi pericolosi (zip slip), limiti di dimensione. Un pacchetto non valido non scrive nulla.
- **Nessuna sovrascrittura**: un pack diverso con lo stesso id viene installato come `<id>-2`; lo stesso contenuto risulta "già installato".
- **Schermata PACCHETTI**: titolo, materia, classe consigliata, versione, domande, giochi, origine; azioni ATTIVA, DUPLICA, ESPORTA, ELIMINA (con il server: cestino recuperabile).
- **Cambio pacchetto senza riavvio** e **senza perdere squadre, punti e partita**; **sessione mista** con più pack (domande in sequenza o mescolate, giochi di tutti i pack, nome del pack accanto alle manche); id domanda qualificati `packId/id`, quindi nessuna collisione tra pack.
- **Provenienza**: la sessione registra i pack usati (`packs`, `activePacks`). Ogni risposta e ogni round registrano `packId`, `packVersion`, `subject`, `topic` e `sourceQuestionId`. Il CSV ha le colonne `pack_id`, `pack_versione`, `materia`, `argomento`, `id_domanda_originale`; il report ha "Pacchetti usati" e "Risultati per pacchetto".
- **Libreria su disco** (server/CLI: cartella `packs/` con `install.json`, installazione atomica, bundle per `file://` rigenerato) e **libreria del browser** senza server (IndexedDB: pacchetti e immagini persistono dopo il ricaricamento; i pack del programma sono in sola lettura).
- **Migrazione automatica**: registrazione dei pack già presenti (Arte romana), pack importati con la prima v3.5, partite salvate con i vecchi id, **ZIP delle edizioni v3 convertiti all'importazione** (provato con il vero `Il_Secchione_PREISTORIA_v3.0.zip`: 52 domande, 24 manche, 10 immagini), `packKey` → `activePacks`.
- **Due pacchetti di prova** diversi in `PACK_ESEMPI/`: Vulcani (Scienze, 2ª, immagini, 4 giochi) e Inglese di base (Inglese, 1ª, solo testo, 3 giochi), con id di domanda volutamente in collisione.
- **23 nuovi test automatici** (`tests/packmanager.test.js`): zip, decompressione identica a zlib, importazione su browser e disco, comando unico, .json, migrazioni, casi non validi, collisioni di id di pack e di domande, attivazione, cambio pack, multi-pack, duplicazione, esportazione con andata e ritorno, eliminazione, sola lettura, API del server. Totale suite: 91/91 con Node 8.16 e Node 24.21.
- Provato nel browser con e senza server: trascinamento di due zip, attivazione, cambio pack con punti invariati, immagini del nuovo pack, sessione mista con CSV corretto, duplicazione, esportazione, collisione, eliminazione, persistenza dopo il ricaricamento, migrazione dei vecchi import e dei vecchi salvataggi.

### PARZIALE
- Senza server, i pack **del programma** (cartella `packs/`) non si possono esportare né eliminare dal browser, perché il browser non può leggere o cancellare quei file. La schermata lo spiega e propone il server o la cartella. Si possono attivare e duplicare.
- I pack importati **senza server** restano nel browser usato (IndexedDB). Per averli nella cartella `packs/` bisogna esportarli e reimportarli con il server attivo.
- Aggiornare un pack a una nuova versione mantenendo lo stesso id non è automatico: la nuova versione riceve un id nuovo e il docente elimina la vecchia. È voluto, per non sovrascrivere mai.
- Libreria del browser aperta da `file://`: provata solo in modalità senza server via http locale. Il caso `file://` reale è da verificare sul PC della scuola.

## Versione iniziale v3.5

## TESTATO

### P1 · Affidabilità locale
- **Timer reale**: la durata viene dal campo `seconds` della domanda o della manche (5–600 s). Editor della domanda e dei giochi con il campo durata. In una manche più lunga o più corta di 30 s Photopuzzle e Staffetta scalano i loro automatismi; a 30 s si comportano come la v3. Il messaggio "30 secondi terminati" è sostituito da "Tempo terminato".
- **Pausa / riprendi e +10 s anche per le domande** (in v3 la pausa funzionava solo nei giochi).
- **Timer di riserva**: continua a contare anche se il browser sospende l'animazione (finestra della regia ridotta a icona).
- **Scoring unico** (`js/engine/scoring.js`) usato da regia, server, report e test. Eliminati i calcoli `300-25*rank` duplicati in `app.js`.
- **Profili di punteggio**: `show_standard` (predefinito: omessa 0), `learning` (1/0/0, il tempo non conta), `legacy_v3` (omessa −100 come prima). Il profilo si sceglie in IMPOSTAZIONI PARTITA, con ricalcolo facoltativo delle domande già giocate.
- **Record grezzi** per ogni risposta: risposta scelta (lettera e indice originale), corretta, esito, `responseTimeMs` (`null` se non misurato), `inputMode`, ordine, dispositivo, timestamp. I punti sono **eventi derivati**, tenuti separati.
- **Autosave e ripresa**: snapshot nel browser e su disco (server). Schermata PARTITA NON CONCLUSA TROVATA con RIPRENDI / NUOVA PARTITA / ESPORTA E ARCHIVIA. Una partita non conclusa non può essere sovrascritta prima della scelta.
- **Asset**: mascotte da 12 file (13,3 MB) a 2 file (1,3 MB), mappa delle pose aggiornata. Logo PNG non usati spostati in `assets/sorgenti_grafiche/`. Audio lasciato in WAV, con la motivazione in [ASSET_AUDIT.md](ASSET_AUDIT.md). Cartella da 26,4 MB a 15 MB.
- **Documentazione coerente**: niente riferimenti a file inesistenti (`LEGGIMI.txt` della v3 citava un HTML offline che non c'era).

### P2 · Inserimento manuale veloce
- **Griglia `A B C D Ø`** per squadra nella scheda DOMANDA, senza cambiare scheda. Esito (✓ ✗ Ø), anteprima dei punti e origine del dato (▣ tablet) sono visibili.
- **Tastiera**: `A`–`D`, `0`/`O` con avanzamento automatico alla squadra successiva; `↑`/`↓`; `Canc`; `Ctrl+Z`; `Invio` per chiudere il tempo o confermare; `P` pausa; `+` +10 s; `R` rivela. Prova reale: **6 squadre registrate con 6 tasti più Invio**.
- **Ordine delle corrette** = ordine di registrazione, modificabile con ▲. Il round viene marcato `orderOverridden`.
- `inputMode = manual` e `responseTimeMs = null` per l'input manuale.
- **RIAPRI PUNTI** dopo la conferma: le risposte precedenti restano nel log come `voided`.
- **Uscendo da una domanda non confermata**: con tutte le risposte la conferma è automatica, altrimenti il docente sceglie. Prima le risposte si perdevano senza avviso.
- **"Mancanti = Ø"** registra le squadre mancanti come omesse.

### P3 · Pulsantiere web (MCQ)
- **Server locale** Node senza dipendenze (`server/`): HTTP + WebSocket RFC 6455, rotte `/host` `/player` `/show` `/network-test`.
- **Ingresso**: QR + PIN di 4 cifre, richiesta della squadra dal tablet, approvazione singola o "approva tutte", assegnazione e riassegnazione dal menu, espulsione, chiusura e riapertura degli ingressi. Nessun account, email o nome.
- **Token casuale** per dispositivo, rigenerato a ogni assegnazione; **riconnessione** dopo refresh, rete persa o browser chiuso ("RICONNESSO COME 2B"), anche a ingressi chiusi, senza duplicati.
- **Pulsantiera**: A/B/C/D selezionabili e modificabili, **INVIA** separato e definitivo, tasti bloccati e "RISPOSTA REGISTRATA", esito solo dopo il reveal, banner di pausa e di rete persa, schermo intero e Wake Lock su gesto, nessuno scroll accidentale.
- **Server autoritativo**: round aperto/pausa/chiuso con scadenza e 500 ms di tolleranza, timestamp e tempo di risposta del server, una risposta per squadra (seconda uguale idempotente, diversa rifiutata), `roundInstanceId` monouso, rate limiting, convalida della risposta, ricalcolo del punteggio al commit con riallineamento dei dati dei tablet.
- **La soluzione non viene mai inviata ai tablet prima del reveal.** Banca domande e codice della regia non sono raggiungibili dalla rete, verificato da un indirizzo LAN reale.
- **Squadre miste**: le squadre senza tablet usano la griglia manuale nella stessa domanda. A fine tempo le squadre con il tablet che non hanno inviato risultano omesse automaticamente; se tutte usano il tablet, la conferma al reveal è automatica.
- **Sblocco** di una squadra (↺) per farla rispondere di nuovo.
- **Stato dei dispositivi** in regia: connesso/disconnesso e latenza in ms.

### P4 · Report di classe
- **JSON completo**, **CSV** (una riga per risposta, `;` e BOM per Excel in italiano), **report HTML** stampabile (classifica, % corrette, corrette/errate/omesse, categorie, domande con più errori e risposte errate scelte, tempi medi e mediani **solo se misurati**, nota "report formativo"), **log tecnico** (regia e server uniti).

### P5 · Separazione motore / contenuti
- Pack neutro `packs/<id>/` (`pack.json`, `questions.json`, `games.json`, `images/`), bundle generato per `file://`, rigenerato in automatico dal server.
- Arte romana convertita: 72 domande e 33 manche, gli stessi contenuti della v3.
- Compatibilità v3: import di `domande_romana.json` e dei giochi v3, migrazione automatica delle personalizzazioni salvate nel browser dalla v3, convertitore di intere edizioni (`tools/convert_v3_pack.js`, utilizzabile per Preistoria e Barocco).
- Testi della home, intestazioni e nome del file di export presi dal pack: niente più "ARTE ROMANA" cablato nel motore.
- Metadati facoltativi: materia, anno di corso, argomento, difficoltà, autore, stato (le bozze sono escluse dalla gara); per la sessione istituto, anno scolastico, classe, modalità `lesson`/`qualification`/`final`.
- `Participant` generico (`team` | `individual`), anche se oggi in regia si usano solo squadre.
- [PACK_FORMAT.md](PACK_FORMAT.md) e `PACK_TEMPLATE/` validi (verificati dai test).

### P6 · Rete e robustezza
- `/network-test` (HTTP + WebSocket, mediana e massimo).
- Finestra PULSANTIERE con IP, porta, QR (pulsantiera o test rete), PIN, dispositivi, latenza media e schermi `/show`.
- Simulazione con 2, 6, 15 e 30 client, stress test con 30 client × 20 domande.
- Persistenza della stanza: dopo un riavvio del server PIN e token restano validi e il round aperto torna in pausa.
- Log tecnico per sessione su disco (`data/logs/*.jsonl`) ed esportabile.
- Launcher `AVVIA_IL_SECCHIONE.bat`: Node nel PATH o `runtime\node.exe`, controllo della versione, messaggio chiaro e modalità manuale se Node manca, rilevamento di un'istanza già avviata, apertura automatica della regia.

### Altre modifiche
- **Nomi neutri dei giochi**: Ghigliottina → **Parola Segreta**, Catena di parole → **Staffetta di parole**. Gli ID interni restano gli stessi e il pack può personalizzare i nomi.
- Il palco non contiene più nel DOM la soluzione di Photopuzzle e Abbinamenti prima del reveal.
- Codice morto rimosso: selettore pack nascosto, consegne `data-receipt`, bonus Indovina mai applicato, costante `SCORE`.

## IMPLEMENTATO (senza test dedicato)
- ~~Import di un pack in un solo file da ARCHIVIO → IMPORTA PACK e cambio pack in IMPOSTAZIONI~~: sostituiti dal Gestore Pacchetti (vedi sopra).
- Archivio locale delle ultime 3 partite archiviate.
- Avviso "regia aperta in un'altra finestra" (la nuova finestra prende il controllo e la vecchia smette di inviare comandi).
- Rilevamento di un'istanza del server già avviata (`EADDRINUSE` → apre la regia esistente).

## PARZIALE
- **`/show` (palco remoto)**: segue la regia in diretta, ma è muto e le animazioni dei pezzi del Photopuzzle sono meno fluide. Il doppio schermo classico (pulsante APRI) resta il metodo consigliato.
- **Layout Vero/Falso, Numerico, Testo breve, Buzzer**: pulsantiera e server li gestiscono (convalida ed esito), ma la regia non ha ancora domande di questi tipi; nei pack sono "previsti ma non ancora giocabili".
- **Giochi arcade con i tablet**: oggi si registrano a mano (✓ / ✗ / Ø). Una prenotazione da tablet (buzzer) è predisposta ma non collegata.
- **Grafica della Parola Segreta**: il nome è neutro, ma l'animazione della "lama" ricorda ancora il format TV. Da valutare un restyling prima di distribuire il software fuori dalla scuola.
- **Accessibilità**: target touch grandi, focus visibile, tastiera, simboli oltre al colore, `prefers-reduced-motion`. Non è stato fatto un audit con screen reader.
- **QR code**: verificato strutturalmente (format bits, version bits e Reed-Solomon secondo ISO), non ancora con la fotocamera di un tablet.

## NON IMPLEMENTATO (fuori ambito, come richiesto)
Account e login, cloud, tornei e campionati, leaderboard nazionale, pagamenti e licenze online, marketplace, app native, hardware (ESP32), AI generativa, analytics predittive, valutazioni psicometriche, nuovi giochi arcade, installer `.exe`. Il server è isolato in `server/` per poterlo impacchettare in futuro.

## Da sapere prima del pilot
- La v3.5 è stata provata in un browser con due schede usate come tablet e con client simulati. **Prima di una lezione** esegui la sezione B di [TEST_CHECKLIST.md](TEST_CHECKLIST.md) con i tablet veri e il Wi-Fi della scuola.
- Al primo avvio il firewall di Windows chiederà il permesso per Node.js: scegli **Reti private**.
