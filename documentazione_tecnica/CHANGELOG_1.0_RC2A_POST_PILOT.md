# Il Secchione · 1.0 RC2-A POST-PILOT — 6 ottobre 2026

Patch di gioco nata da **tre sessioni reali in classe**. È la Fase A del piano approvato (`Desktop\PIANO_POST_PILOT_v1.0_RC1.md`); la Fase B (editor incorporato CONTENUTI, «Applica i tempi standard») **non è iniziata**.

- **Base**: Training Edition 1.0 RC1 (ZIP SHA-256 `b4323ba3a54c0871c802363f29ef826f1a9b5be5631525147efbcd74465fbd0e`), copiata e lasciata intatta.
- **Verifica della base**: 256/256 checksum, 250 test verdi.

## 1. Punteggio: 200 per la correttezza + bonus velocità fino a 100
- **Formula** (unico contratto in `engine/scoring.js`, usato da regia, server, ricalcolo, report e CSV): `round(300 − 100 × tempo / tempo disponibile)`, sempre tra 200 e 300.
  - Il tempo è quello **reale**, in millisecondi, misurato dal server (pause escluse).
  - Esempi: 15 s → 300 / 280 / 260 / 240 / 220 / 200; 45 s → 300 / 278 / 256 / 233 / 211 / 200.
- **Senza tempo misurato** (risposta a mano, tablet senza tempo) una corretta vale **200**. Nessun tempo inventato.
- **Round misti (D1)**: basta **una risposta corretta inserita a mano** e tutte le corrette del round valgono 200, senza bonus. Se le risposte a mano sono solo errate o omesse, le corrette dei tablet tengono il bonus.
- **Tempo disponibile (D5)**: durata finale del round, compresi i +10 s, uguale per tutto il round.
  - Campo `availableMs` nel round e in ogni risposta. Il server lo tiene da sé e prevale, come per il tempo di risposta; sopravvive al riavvio del server.
- **Errate (−100) e omissioni (3 gratuite, poi come un errore)**: invariate.
- **Profili**:
  - nuovo predefinito `show_speed` («Show 200–300»);
  - `show_standard` (300/275/250…) resta per le partite già giocate, che conservano il loro profilo e i loro punti (D6, nessun ricalcolo retroattivo);
  - le preferenze salvate dalla RC1 passano una volta sola al nuovo predefinito.
- **Regia**: il riquadro «Punti di questo round» mostra squadra · tempo · punti. Eliminati i pulsanti ▲ di riordino: l'ordine non dà più punti.
- **CSV**: nuove colonne `tempo_disponibile_ms` e `bonus_velocita`.

## 2. Tempi standard in un solo punto
- **`engine/timer.js` → `DEFAULTS`**:
  - domande A/B/C/D **15 s**, anche con immagine (D4);
  - Photopuzzle, Abbinamenti, Indovina, Staffetta e Parola Segreta **45 s**.
  - Una durata scritta nel contenuto ha sempre la precedenza.
- **Il normalizzatore non scrive più la durata quando manca**: «vuoto» significa «standard». Pack Studio e i dialoghi della regia mostrano il campo vuoto con il tempo standard come suggerimento.
- **Eliminato il minimo di 60 s per i giochi (D3).**
- **Corretto un difetto latente**: nei giochi la manche dei tablet durava `seconds || 30`, mentre il palco ne mostrava almeno 60. Ora palco e tablet usano la stessa durata.
- **Rimossi tutti i 30/60 scritti nel codice.** Un test controlla che non ricompaiano.
- **Pacchetto incluso Arte romana → 3.6.0 (D2, dichiarato)**: tolte le durate scritte (72 domande a 30 s, 33 manche a 60 s), quindi valgono 15 s e 45 s.
  - Barocco, Preistoria e i pacchetti esterni **non sono stati toccati**. Il comando «APPLICA TEMPI STANDARD» arriverà nella Fase B.

## 3. Dopo ogni domanda: risultato del round, non classifica
- **«RISULTATO DEL ROUND»**: per ogni squadra esito, risposta, tempo (es. «4,2 s», oppure «A MANO») e **punti guadagnati nel round**, con la nota «bonus velocità +72» oppure «senza bonus».
- **Niente numeri di posizione, colori da podio o totali.** Le righe compaiono a cascata dall'alto.
- **La regia** continua a vedere i totali.

## 4. Classifica solo su comando
- **Fine dei contenuti** (archivio o scaletta): schermata neutra **FINE DEI CONTENUTI**. AVANTI non apre la classifica; il pulsante principale diventa **★ CLASSIFICA FINALE**.
- **★ CLASSIFICA, in qualunque momento**: fa partire la proclamazione dall'ultimo posto (prima a metà partita mostrava tutto subito).
  - A metà partita, alla fine compare **TORNA AL GIOCO** e si riprende da dove si era.
  - Dopo la fine dei contenuti compare **✓ TERMINA PARTITA**.

## 5. Leggibilità del palco
- **Domanda**:
  - intestazione su una riga;
  - niente piè di pagina con le regole né mascotte;
  - timer più grande;
  - le risposte **riempiono tutta l'altezza**: griglia 2×2 se brevi, una per riga se lunghe.
- **Adattamento del testo (`js/stage-fit.js`)**: sceglie il testo più grande che entra, in percentuale dell'altezza dello schermo.
  - Domanda tra 4,2% e 6,2% (a 768 righe 32–48 px, a 1080 righe 45–67 px).
  - Risposte tra 3,4% e 4,8% (a 768 righe 26–37 px, a 1080 righe 37–52 px).
  - Sotto il minimo non si scende (classe `tooLong`).
  - Si ricalcola quando cambia la dimensione della finestra.
- **Soluzione e spiegazione** più grandi (spiegazione ≥ 2,6% dell'altezza).
- **4:3 e altre forme**: domanda, risultato del round e fine contenuti occupano tutta la finestra. Le altre schermate restano 16:9.

## 6. Schermo intero
- **Pulsante «⛶ SCHERMO INTERO» grande** sulla finestra del proiettore (aperta dalla regia o `/show`), tasto **F**, «nascondi».
  - Sparisce a schermo intero e ricompare dopo ESC.
  - Se il browser rifiuta o non risponde entro 1,5 s, il pulsante dice «premi F11».
- **Rimosso** lo schermo intero «al primo clic ovunque» di `/show`.
- **Regia**: pulsante ⛶ SCHERMO INTERO / ⤢ ESCI nella barra in alto.

## 7. Tastiera delle pulsantiere
- **5 righe a tutta altezza**:
  1. QWERTYUIOP
  2. ASDFGHJKL
  3. ZXCVBNM ⌫
  4. À È É Ì Ò Ù ' -
  5. 123 · SPAZIO · CANCELLA · **INVIA**
- **Numeri dietro il tasto 123 (D7).**
- **Tasti alti almeno 44 px** (fino a 96 px sui tablet), testo digitato grande.
- **Un solo invio**: il pulsante si spegne subito; il server resta idempotente.
- **Conferma**: schermata verde «✓ RISPOSTA REGISTRATA» con la risposta inviata.
- **Domande A/B/C/D**: invariate, solo i quattro tasti.

## Documenti
- **GUIDA_DOCENTE, INIZIA_QUI, RISOLUZIONE_PROBLEMI**: punteggio 200–300, risultato del round, classifica su comando, schermo intero, tempi standard. In RISOLUZIONE_PROBLEMI «Duplica» diventa «Estendi», perché con «Duplica» il proiettore mostrerebbe i totali della regia.
- **Checklist del docente sconosciuto** aggiornata.

## Non fatto in questa fase (Fase B, dopo il test in classe)
- **Editor incorporato CONTENUTI** (Pack Studio nella regia), unificazione degli editor, comando «APPLICA TEMPI STANDARD».
- **Avviso «testo troppo lungo per il proiettore» in Pack Studio**: va con l'editor. Nei test anche risposte da 199 caratteri restano sopra il minimo leggibile.

## Test
- **Test della base aggiornati per comportamento approvato**, ognuno con un commento RC2-A:
  - `classroom_flow_361` (niente minimo 60 s; Arte romana senza durate);
  - `pack.test` (durata assente = standard);
  - `scoring.test` (predefinito show_speed);
  - `timer.test` (15 s);
  - `classroom_readability_371` (risultato del round a cascata);
  - `content_import_podium_373` (classifica a metà partita = proclamazione; fine contenuti);
  - `session_planner_370` (fine scaletta; versione);
  - `report.test` (nuova colonna CSV);
  - `training_rc1` (profilo classico, pulsante schermo intero).
- **Nuovi**: `tests/rc2a_post_pilot.test.js` (24 test). Totale **274 superati, 0 falliti**.
- **Risultati**: `QA/TEST_RESULTS_1.0_RC2A.md`.
