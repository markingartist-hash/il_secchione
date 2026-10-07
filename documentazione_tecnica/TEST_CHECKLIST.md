# TEST_CHECKLIST

Legenda stato: **✅ verificato** in sviluppo (3 ottobre 2026) · **⬜ da fare** sul PC e sui tablet della scuola prima del pilot.

## A. Test automatici (da rieseguire dopo ogni modifica)

```bash
node tests/run.js
```

```bash
node tools/simulate_players.js
```

| Area | Cosa verifica | Stato |
|---|---|---|
| scoring | `legacy_v3`, `show_standard`, `learning`; ordine delle corrette; penalità; astensione/omessa; minimo 0; duplicati; ricalcolo dello storico con un altro profilo | ✅ 14 test |
| timer | secondi dalla domanda (15/60), pausa, ripresa, +10 s, fine, snapshot | ✅ 7 test |
| responses | round chiuso/aperto, prima risposta, doppia risposta, roundInstanceId vecchio, token non valido, pausa, scadenza, sblocco, riassegnazione, soluzione mai inviata | ✅ 17 test (`room.test.js`) |
| server | permessi HTTP (anche da un indirizzo LAN reale), flusso completo, riconnessione, ingressi chiusi, rate limit | ✅ 7 test |
| persistence | salva / chiudi / riapri / riprendi (browser e server), protezione della partita non conclusa, archivio | ✅ 4 + 2 test |
| pack | pack installato, immagini esistenti, import v3 domande e giochi, PACK_TEMPLATE, pack non valido rifiutato | ✅ 9 test |
| report | CSV (BOM, `;`, virgolette), statistiche, report HTML, log tecnico | ✅ 5 test |
| QR | format bits ISO, version bits, Reed-Solomon | ✅ 5 test |
| Gestore Pacchetti | zip (CRC, decompressione = zlib, zip di Windows, file danneggiati); importazione su browser e disco; comando unico; .json con immagini incorporate; conversione v3; migrazione; 8 casi non validi senza scritture; collisioni di id di pack e di domande; attivazione; cambio pack; multi-pack; duplicazione; esportazione con andata e ritorno; eliminazione; sola lettura; API del server | ✅ 23 test |
| pilot_hotfix (v3.5.2) | regressioni delle correzioni QA della v3.5.2: token UTF-8, limiti ZIP, Host/Origin, errori di stream, saluti SHOW/Player, socket | ✅ 13 test |
| Pack Studio (v3.5.3) | bozza, domande (crea/duplica/sposta/elimina), validazione con indicazione del punto da correggere, tag, bozze escluse, immagini piatte (nomi sicuri, estensione reale, rinomina, eliminazione, appiattimento), 5 tipi di manche, ZIP con andata e ritorno, Arte romana completo, versione, salvataggio nuovo/sostituzione su browser e disco con copia di sicurezza, rifiuto di sottocartelle e sola lettura, API `PUT` e pagina `/studio` solo in locale | ✅ 19 test |
| CSV sicuri (v3.5.3) | neutralizzazione `= + - @` e affini, numeri negativi conservati, testi ostili di squadre, pack e studenti, modalità grezza, log tecnico, report HTML | ✅ 5 test |
| mascotte (v3.5.4) | WebP identici a quelli forniti, mappatura umore → posa uguale in regia e SHOW, panic solo a tempo scaduto, animazioni solo transform/opacity con durate della specifica, movimento ridotto, Player senza mascotte, pose servite anche in rete | ✅ 6 test |
| multiplayer | 2 / 6 / 15 / 30 pulsantiere simulate: join, assegnazione, chiusura ingressi, risposte quasi contemporanee con doppi tocchi, reveal, commit, disconnessione e riconnessione, intruso a ingressi chiusi | ✅ nessuna risposta persa né duplicata (ultima simulazione v3.6.1: 2/6/15/30 tablet × 5 domande; 150 risposte nel caso 30 tablet, ack max 1 ms) |

| Scaletta e regia one screen (v3.7.0) | riferimenti senza copie, niente duplicati silenziosi, duplicazione esplicita, SU/GIÙ, mescola solo domande, mancanti mai sostituiti, occorrenze e sessioni miste, salvataggio/riapertura/import/merge, AVANTI in classe (gioco, duplicato, deviazione, indietro, mancante durante la lezione), report, una sola azione principale per fase, nessun doppione, Ø solo quando serve, preferenze sul server | ✅ 18 test |

Totale v3.7.0: **208 test superati** (190 della v3.6.1 + 18 di `tests/session_planner_370.test.js`). Simulazione 2/6/15/30 pulsantiere: nessuna risposta persa o duplicata.

Totale v3.7.3: **225 test superati** (213 della v3.7.2 + 12 di `tests/content_import_podium_373.test.js`: riconoscimento del file, sostituzione di domande e giochi salvata nel pacchetto con backup e riapertura, blocchi, cablaggio, classifica finale dall'ultimo al primo con pari merito, layout per 3/6/12 squadre, regia e animazioni). Simulazione 2/6/15/30 pulsantiere: nessuna risposta persa o duplicata.

| Test manuale v3.7.3 | Atteso | Stato |
|---|---|---|
| ARCHIVIO → ESPORTA, modifica il file, 📥 IMPORTA CONTENUTI | riepilogo "archivio domande … verranno sostituite", backup scaricato, domande sostituite, restano dopo la riapertura | ✅ |
| GIOCHI → ESPORTA GIOCHI, file con un solo tipo | tabella per tipo, solo quel tipo sostituito | ✅ |
| Trascina uno `.zip` di pacchetto sulla regia | "Pacchetto installato correttamente", ATTIVA ORA | ✅ |
| File di risultati, scaletta, file sconosciuto | spiegazione chiara, nulla modificato senza conferma | ✅ |
| Fine partita con 3, 6, 12 squadre | intro, una posizione per AVANTI, 1° per ultimo, pari merito, nessuna sovrapposizione a 1366×768 e 1920×1080 | ✅ |
| Refresh dello SHOW a reveal in corso, AVANTI rapidissimi | stesso punto, nessun passo perso | ✅ |
| Proiettore reale | leggibilità dal fondo dell'aula | ⬜ |

Storico v3.7.1: **212 test superati** (208 della v3.7.0 + 4 di `tests/classroom_readability_371.test.js`). La tastiera testuale non ricostruisce più tutto il DOM a ogni carattere; primo AVANTI dopo il reveal = classifica del round full-screen, secondo AVANTI = contenuto successivo. Simulazione 2/6/15/30 pulsantiere: nessuna risposta persa o duplicata.

Storico v3.6.1: **190 test superati** (182 della v3.6.0 + 8 di `tests/classroom_flow_361.test.js`). Simulazione 2/6/15/30 pulsantiere: nessuna risposta persa o duplicata.

Storico v3.6.0: **182 test superati** (i 165 della v3.5.4_ANSWER_MATCHER più 17 di `tests/classroom_control.test.js`); prima della v3.6.0: **136 test superati** con il runtime supportato, il Node 24 portable incluso (24.19). La v3.5.3 ne aveva 130, verificati anche con Node 24.21. Solo per informazione, con Node 8.16 ne passano 128: i 2 test di `pilot_hotfix` usano API di Node 10 o successivo e falliscono allo stesso modo sulla v3.5.2. Non sono un blocco.

> La simulazione gira sullo stesso PC (loopback): misura la correttezza del server, **non** la qualità del Wi-Fi della scuola. Per quella servono i test B2, B3 e B7.

## B. Test manuali obbligatori

| # | Test | Come | Atteso | Stato |
|---|---|---|---|---|
| 1 | Partita senza tablet | `AVVIA_SENZA_TABLET.bat`, 6 squadre, 3 domande | Griglia A/B/C/D/Ø, 6 squadre in 7 tasti, punti corretti | ✅ (browser, server statico locale) · ⬜ da `file://` sul PC della scuola |
| 2 | Partita con 2 tablet | QR + PIN, approva, chiudi ingressi, 3 domande | Risposte in diretta in regia, punteggio verificato dal server | ✅ (2 schede browser come tablet) · ⬜ con tablet veri |
| 3 | Partita con 6 tablet | come 2 | Nessuna risposta persa, latenza < 300 ms | ✅ simulato · ⬜ con tablet veri |
| 4 | Risposta selezionata ma non inviata | toccare C senza INVIA, lasciare scadere il tempo | Nessuna risposta inviata; la squadra risulta "omessa" | ✅ |
| 5 | Cambio risposta prima di INVIA | toccare C, poi B, poi INVIA | Registrata B | ✅ |
| 6 | Doppio INVIA | premere INVIA due volte velocemente | Una sola registrazione; la seconda è idempotente | ✅ (automatico + simulazione) |
| 7 | Tablet perde la rete | Wi-Fi off 10 s durante una domanda, poi on | Banner "Connessione persa", poi "RICONNESSO COME …"; se aveva già inviato, la risposta resta | ✅ simulato · ⬜ con tablet veri |
| 8 | Refresh del tablet | ricaricare la pagina a risposta inviata | "RICONNESSO COME 2B", risposta ancora bloccata, nessun PIN | ✅ |
| 9 | Ingresso dopo la chiusura | nuovo dispositivo con il PIN a ingressi chiusi | "Gli ingressi sono chiusi" | ✅ (automatico) |
| 10 | Domanda da 15 s | ARCHIVIO → Modifica → Secondi 15 | Timer 15 s in regia, sul palco e sul server | ✅ automatico · ⬜ visivo |
| 11 | Domanda da 60 s | come 10 con 60 | Timer 60 s; il server accetta fino a 60 s | ✅ (browser + server) |
| 12 | Pausa timer | ⏸ PAUSA, attendere, ▶ RIPRENDI | Il tempo in pausa non viene consumato; i tablet mostrano "TEMPO IN PAUSA" e non possono inviare | ✅ automatico · ⬜ visivo |
| 13 | Crash/refresh della regia | chiudere la scheda della regia a metà domanda | Alla riapertura: PARTITA NON CONCLUSA TROVATA | ✅ |
| 14 | Resume della sessione | RIPRENDI | Squadre, punti, domanda corrente (in pausa), tablet ancora associati | ✅ |
| 15 | Export CSV | CLASSIFICA → RISPOSTE CSV, aprire con Excel | Colonne leggibili, accenti corretti, una riga per risposta | ✅ contenuto · ⬜ apertura in Excel |
| 16 | Show su secondo schermo | APRI (doppio schermo) e `/show` da un altro dispositivo | Il palco segue la regia; nessun IP, token o risposta privata | ✅ `/show` · ⬜ finestra APRI sul proiettore |
| 17 | Gioco arcade legacy | tutte le 33 manche | Si caricano e partono senza errori | ✅ 33/33 |
| 18 | Import di vecchie domande | ARCHIVIO → IMPORTA `legacy_v3/domande_romana.json` | 72 domande importate | ✅ automatico · ⬜ dal pulsante |
| 19 | Modalità manuale dopo un guasto di rete | spegnere il Wi-Fi durante la partita | La griglia manuale continua a funzionare; gli omessi automatici si possono correggere a mano | ⬜ |

### Pacchetti
| # | Test | Atteso | Stato |
|---|---|---|---|
| P1 | PACCHETTI → IMPORTA PACCHETTO con `PACK_ESEMPI/vulcani.zip` | installato, compare nell'elenco con materia, classe, versione | ✅ (trascinamento simulato) · ⬜ con il pulsante |
| P2 | Trascinare uno .zip su `IMPORTA_PACCHETTO.bat` | messaggio "installato" nella finestra nera | ✅ comando · ⬜ trascinamento sul .bat |
| P3 | Importare lo ZIP di un'edizione v3 (Preistoria) | convertito, 52 domande e 24 manche | ✅ |
| P4 | ATTIVA durante una partita | squadre e punti invariati, domande del nuovo pack | ✅ |
| P5 | Sessione mista Vulcani + Inglese | 12 domande, id distinti, CSV con pack_id corretto | ✅ |
| P6 | Reimportare lo stesso .zip | "già installato" | ✅ |
| P7 | Importare un pack modificato con lo stesso id | installato come `<id>-2`, originale invariato | ✅ |
| P8 | ESPORTA e reimporta su un altro PC | stesso pacchetto | ✅ andata e ritorno · ⬜ altro PC |
| P9 | Modalità senza server da `file://`: importa, ricarica la pagina | pacchetto ancora presente | ✅ via http locale · ⬜ da file:// |

### Pack Studio
| # | Test | Atteso | Stato |
|---|---|---|---|
| S1 | PACCHETTI → ✏ PACK STUDIO → nuovo pacchetto, una domanda con immagine, SALVA | compare in PACCHETTI senza ricaricare la regia | ✅ |
| S2 | MODIFICA su un pacchetto, cambia una spiegazione, SALVA → AGGIORNA | versione +0.0.1, copia della precedente in `data/cestino_pacchetti/` | ✅ |
| S3 | Modificare il pacchetto in gara | la partita non cambia; dopo ATTIVA, nuove domande con squadre e punti invariati | ✅ |
| S4 | Lasciare un'alternativa vuota | errore sulla domanda giusta, salvataggio bloccato, clic sul problema porta alla domanda | ✅ |
| S5 | Le 5 manche speciali con anteprima | valide dopo la compilazione, giocabili dalla regia | ✅ creazione e validazione · ⬜ partita completa in classe |
| S6 | ESPORTA ZIP e riaprirlo con «Apri un file .zip» | stesso contenuto; al salvataggio propone sostituzione o nuovo codice | ✅ |
| S7 | Chiudere la pagina con modifiche non salvate e riaprirla | la bozza è in «Bozze in corso» e si riprende con le immagini | ✅ |
| S8 | Senza server (libreria del browser): crea, salva, riapri, attiva nella regia | funziona; i pack del programma hanno MODIFICA disattivato | ✅ via http locale · ⬜ da file:// |
| S9 | Un docente non tecnico crea un pacchetto di 5 domande senza aiuto | riuscito in meno di 15 minuti | ⬜ |
| S10 | Pacchetti reali Preistoria 1ª, Arte romana 2ª, Barocco 3ª media (v1.1.0). Ciclo: importa, apri in Studio, modifica domanda, gioco e immagine, salva, gioca, riavvia, esporta, elimina, reimporta | tutto conservato; lo ZIP esportato dopo il riavvio contiene le modifiche | ✅ ciclo completo su Preistoria · ✅ modifica e salvataggio su Arte romana e Barocco |
| S11 | Domanda modificata dall'ARCHIVIO della regia, poi pacchetto aperto e salvato nello Studio | lo Studio parte dalla domanda modificata; dopo il salvataggio la modifica è nel pacchetto e la regia non ha più copie a parte | ✅ |

### Scaletta e regia "one screen" (v3.7.0)
| Test | Atteso | Stato |
|---|---|---|
| Crea una scaletta con domande e giochi di due pacchetti, riordina, duplica, togli, mescola | elenco aggiornato, giochi fermi nel mescolamento, "✓ salvata" | ✅ |
| Chiudi e riapri il browser, riapri la scaletta dall'elenco | stessa scaletta, stesso ordine | ✅ |
| Importa una scaletta con contenuti che non esistono più | elementi MANCANTE in rosso, con motivo; all'avvio conferma e salto | ✅ |
| ▶ AVVIA SCALETTA con 6 tablet, poi solo AVANTI fino alla fine | pacchetti attivati da soli, squadre e tablet intatti, punti registrati, classifica finale | ✅ (6 pulsantiere WebSocket) · ⬜ con tablet veri |
| Refresh della regia a metà scaletta → RIPRENDI | stesso elemento, scaletta ancora in corso | ✅ |
| Regia a 1920×1080, 1366×768, 1280×720, 1024×768 | pulsanti interi, nessuno scorrimento orizzontale, azione principale visibile | ✅ |

### Controlli aggiuntivi consigliati
| Test | Stato |
|---|---|
| Doppio clic su `AVVIA_IL_SECCHIONE.bat`: il server parte e stampa indirizzo e PIN | ✅ (con Node nel PATH) · ⬜ sul PC della scuola, anche **senza** Node (messaggio + modalità manuale) |
| Avviso del firewall di Windows al primo avvio (scegliere "Reti private") | ⬜ |
| QR inquadrato con la fotocamera di un tablet | ⬜ (QR verificato solo strutturalmente: format bits, version bits e Reed-Solomon) |
| `/network-test` da un tablet | ✅ dal browser del PC · ⬜ da un tablet |
| Fullscreen e schermo sempre acceso sulla pulsantiera (Android, iPad, Chromebook) | ⬜ |
| Tablet vecchio (Android 7 / iOS 12) | ⬜ |
| Migrazione automatica delle personalizzazioni v3 (domande e giochi) | ✅ |
| Cambio di profilo con ricalcolo dello storico | ✅ |
| Riapri punti → correggi → conferma | ✅ automatico (motore) · ⬜ visivo |

## C. Prova di usabilità "insegnabile a un collega"

Protocollo (da fare prima del pilot di formazione):
1. Il collega riceve solo la cartella e [GUIDA_RAPIDA_DOCENTE.md](GUIDA_RAPIDA_DOCENTE.md), più 10 minuti di spiegazione.
2. Senza aiuto deve: avviare; creare le squadre; lanciare il quiz; collegare le pulsantiere **oppure** usare la modalità manuale; registrare le risposte di 5 domande; mostrare la classifica; esportare il report.
3. Annotare ogni punto in cui chiede aiuto o esita più di 30 secondi.
4. Se il collega non arriva in fondo da solo, semplificare l'interfaccia **prima** di aggiungere funzioni.

| Esito | Data | Collega | Note |
|---|---|---|---|
| ⬜ | | | |


## v3.7.2 REVEAL FIX
- 213 test automatici verdi.
- Risultati del round su pagina dedicata, nessuna mini-classifica sotto la soluzione.
- Tempi server mostrati per corrette ed errate; manuale dichiarato; astensione senza tempo inventato.
- Avvio con vecchia versione già attiva: nuova build su porta successiva.
