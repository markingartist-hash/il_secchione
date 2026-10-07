# Audit e release conservativa — Il Secchione v3.5.2_PILOT

**La build allegata è rimasta la base del progetto.** Ora include il runtime per l'avvio autonomo e le correzioni conservative descritte sotto. L'architettura HTTP + WebSocket, gli snapshot JSON atomici, il fallback file:// e il motore originale sono conservati. Nessuna nuova funzione didattica è stata aggiunta.

## Base ed esito

- Sorgente: `Il_Secchione_v3.5.1_CLASSROOM_KEYBOARD_GIOCHI.zip`.
- SHA-256 sorgente: `005f184a535edf671f4d8a5e055c78eb2de227e700b48dc7e318c532a9dfda2f`.
- Baseline prima delle modifiche: **93 test superati, 0 falliti**; simulazione con 2, 6, 15 e 30 client senza perdite o duplicati.
- Release corretta: **106 test superati, 0 falliti** (93 originali + 13 nuovi). Stessa simulazione superata.
- E2E reali: **11 verifiche di percorso per browser, superate in Chrome e Edge**, con sei contesti Player indipendenti, un HOST e uno SHOW.
- Launcher originale eseguito con PATH privo di Node, directory con spazi e runtime incluso: **HOST HTTP 200**. L'apertura automatica del browser è stata disabilitata solo nel test tramite il flag già esistente `SECCHIONE_NO_OPEN`; le pagine sono state aperte dai browser E2E.
- Nessun errore JavaScript o richiesta Internet rilevato nel percorso E2E. Fallback file:// verificato con browser offline.

I log sono in `QA/`; i risultati non certificano ogni combinazione di hardware, browser o input. I test su una sola macchina non misurano la qualità del Wi-Fi scolastico.

## P0/P1 corretti automaticamente

P0 = possibile interruzione completa della gara da input non fidato. P1 = affidabilità, perdita dati o protezione del confine di fiducia che ostacolano un pilot affidabile. Le correzioni non cambiano il percorso ordinario del docente o le regole del gioco.

| ID | Priorità | Problema verificato | Correzione e prova |
|---|---|---|---|
| A01 | P0 | Token di 32 caratteri Unicode: `timingSafeEqual` riceve buffer di lunghezza diversa e genera un'eccezione non gestita. | Verifica delle lunghezze UTF-8 prima del confronto; test Room e WebSocket reale, server ancora raggiungibile. |
| A02 | P1 | ZIP principale senza Node: avvio con tablet dipendente da un'installazione esterna. | Node v24.19.0 win32 x64 incluso con licenza, firma digitale valida; BAT originale provato con PATH contenente solo System32. |
| A03 | P1 | Uno ZIP che dichiara 1 byte può decomprimere 1 MiB prima di essere rifiutato; input più grandi possono esaurire memoria. | Limite durante la decompressione nativa e JS; fixture piccola, dimensione zero e ZIP contraffatto verificati. Nessuna prova distruttiva di esaurimento memoria. |
| A04 | P1 | INVIA può restare bloccato se manca l'ACK e arriva un nuovo round: `sending` non si azzera. | Reset al cambio round/assenza round; due test MCQ/testo con ACK vecchio e un test di conservazione del retry. Due manche Indovina consecutive verificate nei browser. |
| A05 | P1 | La risposta locale `/host` con Host arbitrario contiene la chiave regia; manca il controllo Origin nell'upgrade. | Host ammesso solo per IP, localhost e nome PC; Origin, quando presente, deve coincidere. Test HTTP e upgrade cross-site. La chiave e il vincolo loopback restano necessari per HOST. |
| A06 | P1 | Migrazione pack legacy: l'elenco sorgente viene cancellato anche dopo importazione fallita. | Conservate le sole sorgenti non migrate; test con successo, errore applicativo ed errore di rete. |
| A07 | P1 | Errore di lettura dopo `fs.stat` su un asset: evento stream `error` non gestito. | Chiusa soltanto la risposta HTTP; fault injection e successiva richiesta `/api/ping` riuscita. |
| A08 | P1 | Ripetere hello SHOW registra più volte la stessa connessione, senza rate limit, e consente tentativi di cambio ruolo. | Saluto idempotente/ruolo stabile; 50 saluti producono un solo SHOW, nessun accesso HOST; i tentativi Player falliti non resettano il rate limit né eliminano il timeout iniziale (test dedicato). |
| A09 | P1 | Fine TCP senza frame di chiusura: il WebSocket non gestisce `end`, lasciando connessioni pendenti. | Collegato `end` alla stessa chiusura già usata per error/close. Riprodotto durante il test del token malformato; il test ora termina regolarmente. |

Le riproduzioni della baseline sono conservate in `QA/baseline-repro.json`; l'audit iniziale precedente agli interventi è in `QA/AUDIT_INIZIALE.md`.

## Punto P1 da decidere prima della distribuzione a terzi

**CSV e formule da contenuti non fidati.** `js/engine/report.js:csvCell` quota separatori e virgolette, ma conserva stringhe che iniziano con `=`, `+`, `-`, `@` o controlli. Un testo importato può quindi essere interpretato come formula da un foglio di calcolo. Non è stato eseguito alcun payload su Excel. Un valore innocuo `=1+1` è sufficiente a verificare l'assenza di neutralizzazione nel file prodotto.

Non è stato modificato automaticamente il CSV: aggiungere prefissi cambia il valore grezzo esportato e può rompere elaborazioni didattiche esterne, oltre il vincolo di mantenere il comportamento. Proposta: distinguere export per foglio di calcolo (testi neutralizzati, numeri veri conservati) dall'export dati grezzi, versionando/documentando il contratto. **Costo: 0,5–1,5 giornate; rischio medio sulla compatibilità; beneficio alto prima di accettare pack di terzi.** Nel frattempo usare il report HTML per contenuti non fidati o importare il CSV esplicitamente come testo.

## P2 e limiti osservati, non modificati

| Area | Riscontro | Prossimo intervento proposto |
|---|---|---|
| Versioni pack | Impronta CRC32 sui contenuti, non identità crittografica; modifiche solo ai metadati possono risultare “già installato”. Le collisioni ID aggiungono un suffisso, non aggiornano in luogo. | Specificare aggiornamento/rollback e impronte SHA-256. Non usare l'impronta attuale come autenticazione dell'autore. |
| Immagini annidate | Import e scrittura supportano sottocartelle, mentre PUBLIC_PACK_IMAGES espone in LAN solo immagini direttamente in images/. | Test pack con immagini annidate e allineamento della whitelist. Il pack Arte romana incluso usa immagini piatte e supera i controlli. |
| Validazione immagini | Si verificano estensione/firma iniziale e peso; non il contenuto decodificato o il numero di pixel. | Limite dimensioni/pixel, rifiuto di immagini corrotte e nomi Windows ambigui; valutare decoder isolato. |
| ZIP | CRC, dimensioni, estensioni e zip-slip sono controllati; restano da approfondire nomi equivalenti, entry duplicate e casi Unicode/Windows. | Corpus avversario aggiuntivo e politica univoca sui nomi; non introdurre un nuovo backend. |
| Salvataggi | Snapshot atomici e ripresa passano i test. Resta una finestra dovuta al debounce; i test non simulano perdita di alimentazione, disco pieno o antivirus. | Fault injection storage, gestione dei file corrotti e ordinamento delle scritture browser concorrenti. |
| Coda comandi HOST | Commit critici vengono accodati senza sessionId; il cambio sessione offline merita un test specifico per evitare replay nella sessione nuova. | Definire il comportamento desiderato prima di modificare il protocollo. Non riprodotto nel percorso ordinario. |
| CSV/report | Dizionari JS con prototipo possono trattare male categorie/ID come constructor; HTML generalmente protetto da escaping. | Test su chiavi riservate e dizionari senza prototipo, separatamente dalla revisione del CSV. |
| SHOW | Parità visiva parziale dichiarata dalla build: manca la gestione audio remota; il fotopuzzle invia aggiornamenti HTML. | Progetto incrementale di eventi audio e animazioni, con autoplay e riconnessione definiti. |
| Schermi piccoli | A 390×844 la tastiera di Indovina è utilizzabile, ma CANCELLA può fuoriuscire dal tasto; fullscreen sovrapposto in basso. | Ritocco CSS mirato con approvazione della modifica visiva e verifiche 320px/orizzontale. Screenshot in QA/chrome/. |
| Accessibilità | Focus visibile presente; controlli generati e cambi di stato richiedono verifica screen reader, nomi accessibili e annunci live. | Matrice tastiera/NVDA/VoiceOver con criteri di accettazione. |
| Compatibilità | Chrome ed Edge reali passano. Entrambi usano Chromium: non sono prova di Safari/iPad. | Pilot su iPad, Chromebook gestito e tablet fisico più vecchio; rete con isolamento client e sospensione schermo. |
| Distribuzione | ASSET_AUDIT.md originale segnala provenienze/licenze non documentate di vari asset. Runtime incluso con licenza. | Completare le evidenze sugli asset prima della commercializzazione; non è stata attribuita una licenza inventata. |

## Proposte di prodotto: costo, rischio, beneficio

Stime indicative in giornate di un ingegnere, comprensive di test; non sono preventivi. Queste funzioni **non sono state implementate**.

| Proposta | Costo | Rischio | Beneficio e perimetro consigliato |
|---|---:|---|---|
| ESPORTA/IMPORTA PARTITA | 2–4 gg | Medio: conflitti sessione/pack, immagini e rollback | Archivio versionato con snapshot, personalizzazioni e risorse necessarie; anteprima e validazione prima di ripristinare. Nessun copia-incolla di data/. |
| Gestore Pacchetti: aggiornamento + rollback | 3–6 gg | Medio/alto: partite riferite a vecchie versioni | ID stabile, versione distinta, hash forte, confronto prima dell'import, mantenimento della versione usata nello storico. |
| Validazione avanzata pack | 2–4 gg | Medio: rifiuto di vecchi pacchetti ambigui | Corpus ZIP/JSON/immagini ostili, limiti su pixel, duplicati/nome Windows e messaggi comprensibili. |
| SHOW audio/animazioni | 2–4 gg | Medio: autoplay, latenza e doppio audio | Eventi con ID e riaggancio senza riprodurre vecchi suoni; resta il palco classico. Nessuna riscrittura dello show. |
| Riduzione graduale app.js | 3–5 gg, in piccoli passi | Medio: stato condiviso e ordine inizializzazione | Estrarre prima funzioni pure/report UI, poi editor pack; ogni estrazione protetta dagli E2E. Niente framework nuovo. |
| LE MIE CLASSI | 3–5 gg | Medio: migrazione preferenze e associazioni storiche | Entità classId, nome classe, impostazioni predefinite e storico sessionId; cartelle/JSON attuali. Nessun nome alunno e nessun torneo. |
| Release automatizzata continuativa | 1–2 gg | Basso/medio: riproducibilità Windows | Test + manifest + ZIP da copia pulita, verifica runtime e separazione salvataggi. Installer firmato come progetto successivo, 2–4 gg aggiuntivi. |
| Accessibilità e matrice dispositivi | 2–4 gg + accesso hardware | Medio: modifiche UI da validare | Priorità a INVIA/tastiera/focus/annunci e layout piccoli, poi Safari/vecchi tablet e pilot Wi-Fi. |

Sequenza consigliata: pilot supervisionato con pack noti → contratto CSV e verifiche hardware → backup/ripristino → hardening/aggiornamento pack → entità Classe. Il torneo resta fuori perimetro.

## Copertura della review e del rilascio

| Componente | Verifica svolta |
|---|---|
| app.js, core e motori | Lettura dei flussi sessione, timer, risposte, punteggi, arcade, rendering/import/editor; test esistenti; E2E per MCQ e Indovina. Gli altri arcade hanno test motore, non un percorso browser completo in questa revisione. |
| server, room, ws | Ruoli, autenticazione, whitelist file, scadenze, riconnessione, persistenza e input malformati; prove HTTP/WebSocket e simulazione carico. |
| packlib, ZIP, adattatori disco/browser | Traversal, formati, immagini, collisioni, duplicazione/export/eliminazione, migrazione; test validi/invalidi e round-trip. |
| store e report | Guardie di ripresa, atomicità lato disco, archivio, derivazione punteggi, escaping e CSV; limiti residui sopra. |
| Player/Show/Host UI | Browser reali, frame Player, invio doppia manche, timer 30s, cambio pack, refresh/ripresa e screenshot. |
| Asset, contenuti, strumenti, documenti | Inventario/hash, validazione pack e immagini referenziate, controllo sintattico di 47 sorgenti JS/CJS, confronto con la baseline. Materiale storico lasciato invariato salvo istruzioni correnti di avvio. |

`QA/source-diff.json` elenca i file modificati/aggiunti e gli hash prima/dopo. I file di contenuto, HTML/CSS e i motori di scoring/report/store non sono stati modificati. `SHA256SUMS.txt` verifica la copia consegnata prima dell'uso: dopo una partita o l'importazione di pack è normale che i file generati differiscano.

I test automatici e l'audit sono ripetibili; il pilot in aula resta necessario prima di definire il prodotto pronto alla vendita.
