# v3.5.3_PACK_STUDIO — 4 ottobre 2026

Deriva da `Il_Secchione_v3.5.2_PILOT_PORTABLE.zip`, la baseline obbligatoria.
Le correzioni QA della v3.5.2 restano invariate.

- `server.js` e `packstore-disk.js` hanno ricevuto solo aggiunte.
- `room.js`, `ws.js`, `zip.js`, `player.js` e `player.css` non cambiano.
- In `app.js` e `server.js` è cambiata la stringa `VERSION`; in più `app.js` passa alla schermata Pacchetti l'aggancio `dropOverrides` (una riga).

## Pack Studio (nuovo)
Editor grafico dei pacchetti per docenti: `studio.html`, guida in [PACK_STUDIO.md](PACK_STUDIO.md).

- **Pacchetti**: nuovo pacchetto; modifica di quelli della libreria; apertura di un file `.zip` (anche le edizioni v3); bozze salvate automaticamente nel browser e riprese dopo una chiusura.
- **Informazioni**: titolo, sottotitolo, materia, classe, autore, versione, codice, descrizione, licenza, immagine iniziale e colori.
- **Domande**:
  - creazione, modifica, duplicazione, eliminazione con conferma e riordino;
  - quattro alternative con la risposta corretta;
  - spiegazione, difficoltà da 1 a 5, tempo da 5 a 600 secondi, stato (approvata, bozza, da rivedere);
  - categoria, argomento, tag e immagine.
- **Manche speciali**: Photopuzzle, Indovina, Abbinamenti, Parola Segreta e Staffetta, cioè i tipi già supportati dal motore. Si possono creare, modificare, duplicare, eliminare e riordinare, con le stesse regole di `packs.js`.
- **Immagini**:
  - sempre **direttamente in `images/`**, con nomi sicuri e unici;
  - estensione ricavata dal contenuto reale del file e riduzione facoltativa delle foto oltre 1920 px;
  - rinomina con aggiornamento dei riferimenti, ed eliminazione che avvisa se l'immagine è in uso;
  - le immagini in sottocartelle dei pacchetti riaperti vengono spostate in `images/`.
- **Validazione prima del salvataggio**: stesse regole del Gestore Pacchetti. Gli errori sono cliccabili e portano alla domanda o alla manche da correggere; gli avvisi non bloccano il salvataggio.
- **Anteprima**: domande con lo stile dello schermo della classe, in versione domanda e soluzione; manche in anteprima semplificata.
- **Salvataggio nella libreria**: separato dall'importazione, che resta non distruttiva.
  - Modalità *nuovo*: fallisce se il codice esiste già.
  - Modalità *sostituisci*: solo dopo una conferma esplicita.
  - Su disco la versione precedente va in `data/cestino_pacchetti/<id>_<data>_prima-della-modifica`, con sostituzione atomica.
  - I pacchetti del programma in sola lettura non si sovrascrivono.
  - La versione aumenta da sola se il contenuto è cambiato.
- **Esportazione ZIP** nello stesso formato dell'ESPORTA del Gestore Pacchetti, reimportabile e riapribile.
- **Unica fonte persistente**: dopo SALVA il pacchetto installato è la copia di lavoro usata da gioco, esportazione e riapertura.
  - Le copie personalizzate che la regia di quel browser teneva per lo stesso pacchetto (ARCHIVIO domande, editor dei giochi) vengono incluse nello Studio all'apertura ed eliminate dopo il salvataggio, anche dalla memoria della regia aperta.
  - Le bozze dello Studio servono solo a recuperare il lavoro non salvato e spariscono al salvataggio.
  - La conferma di aggiornamento avvisa se la libreria è cambiata dopo l'inizio della bozza.
- **Copia di sicurezza**: la versione precedente resta in `data/cestino_pacchetti/`, fuori dalla libreria e senza effetti sull'identità del pacchetto. Non c'è versioning né ripristino nell'interfaccia.
- **Regia**:
  - in 📦 PACCHETTI compaiono **✏ PACK STUDIO** e **MODIFICA** per ogni pacchetto modificabile;
  - quando lo Studio salva, la regia aggiorna l'elenco da sola;
  - se il pacchetto è in gara la partita non viene toccata: un avviso invita a premere ATTIVA, e squadre e punti restano.
- **Server**:
  - `PUT /api/host/packs/<id>[?mode=replace]`, solo con la chiave regia;
  - pagina `/studio` disponibile solo dal PC del docente (loopback), con la chiave regia iniettata come per la regia.
- **Motore**:
  - `js/engine/packstudio.js`: funzioni pure, browser e Node;
  - `PackLibrary.save()` con `replace` per gli adattatori disco, browser e memoria;
  - avviso non bloccante all'importazione di pacchetti con immagini in sottocartelle;
  - estrazione delle immagini incorporate (`data:`) esposta per lo Studio.

Esclusi di proposito: AI, cloud, marketplace, account, classi, tornei.

## CSV: neutralizzazione delle formule (P1 dell'audit v3.5.2, risolto)
Contratto CSV versione 2, documentato in [EXPORT_CSV.md](EXPORT_CSV.md).

- **Modalità predefinita "foglio di calcolo"**:
  - le celle di testo che iniziano con `= + - @`, con un carattere di controllo (codici 0–31 e 127) o con i segni a larghezza piena ricevono un apostrofo davanti;
  - i numeri veri restano numeri, comprese le penalità negative;
  - vale per il CSV delle risposte (comprese quelle digitate dagli studenti nei giochi) e per il log tecnico.
- **Modalità "dati grezzi"** (RAW) solo da codice con `{ raw: true }`, per chi rielabora i dati. I pulsanti della regia producono sempre la versione protetta; il JSON completo resta l'esportazione grezza.
- **Formato invariato**: separatore, BOM, intestazioni e numero di colonne non cambiano. Nella regia cambia solo la didascalia del pulsante RISPOSTE CSV.

## Test
- `node tests/run.js`: **130 test superati, 0 falliti** con il runtime supportato, il Node 24 portable incluso (24.19), e con Node 24.21. Sono i 106 della v3.5.2, invariati, più 19 di Pack Studio (`tests/packstudio.test.js`) e 5 sul CSV (`tests/csv_safety.test.js`).
- **Solo informativo**: con Node 8.16 e 8.11 passano 128 test. Falliscono gli stessi 2 test di `pilot_hotfix.test.js` che falliscono anche sulla baseline, perché usano API di Node 10 o successivo. Il codice non è stato cambiato per Node 8.
- **Pacchetti reali v1.1.0** (Preistoria 1ª, Arte romana 2ª, Barocco 3ª media): importazione e validazione senza errori, apertura nello Studio in circa 0,2 s.
  - Ciclo completo su Preistoria: importa, apri in Studio, modifica domanda, gioco e immagine (nuova e sostituita), salva, gioca, riavvia il server, esporta, elimina, reimporta. Tutto conservato, compresa una modifica fatta prima dall'ARCHIVIO della regia.
  - Su Arte romana e Barocco: modifica e salvataggio con copia di sicurezza.
- `node tools/simulate_players.js`: 2, 6, 15 e 30 pulsantiere, nessuna risposta persa e nessun duplicato.
- **Collaudo manuale nel browser**, con il server e senza server (libreria del browser). Verificati:
  - creazione, domande, immagini e manche;
  - anteprima, validazione con navigazione agli errori;
  - salvataggio nuovo e sostituzione con copia di sicurezza;
  - aggiornamento automatico della regia e nuova versione in gara dopo ATTIVA;
  - esportazione e riapertura dello ZIP, conflitto di codice, bozze dopo il ricaricamento;
  - Arte romana completo (72 domande, 33 manche, 24 immagini) aperto in circa 0,2 s.
- La suite E2E Playwright di sviluppo (`tests/e2e/`) non è stata rieseguita.
