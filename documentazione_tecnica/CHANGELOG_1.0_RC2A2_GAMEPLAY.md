# Il Secchione · 1.0 RC2-A.2 GAMEPLAY — 7 ottobre 2026

Patch di gioco nata dal **test reale in classe** della RC2-A.1. La Fase B (CONTENUTI) **non è iniziata**: nessun nuovo gioco, nessuna modifica ai pacchetti (Barocco, Preistoria e Arte romana sono invariati).

- **Base**: RC2-A.1 (`1.0.0-rc2a.1`, commit «Baseline Il Secchione RC2-A.1»), **282/282 test verdi** prima di iniziare.
- **Versione**: `1.0.0-rc2a.2` (`js/app.js`, `server/server.js`, `RELEASE.json`).

## 1. Leggibilità dei giochi sul palco
- Photopuzzle, Indovina, Abbinamenti, Ghigliottina e Staffetta usano la **stessa logica delle domande**: `js/stage-fit.js` (`fitGame`) sceglie il testo più grande che entra senza tagli, tra il 3,4% e il 6,6% dell'altezza del palco (`--g-fs`). Ogni elemento ne usa un multiplo (`css/show.css`, blocco «RC2-A.2»).
- **Più spazio al contenuto**: nella colonna destra resta solo il timer (niente mascotte e logo durante il gioco, come già per le domande); intestazione su una riga.
  - Indovina: candidati su due colonne a tutta altezza.
  - Abbinamenti: nomi grandi a tutta altezza; immagini intere (`contain`, **mai `cover`**).
  - Ghigliottina: coppie e parola finale grandi.
  - Staffetta: parole grandi.
  - Photopuzzle: riquadro più largo, `object-fit: cover` e punto focale invariati, colonna delle corrette leggibile.
- **4:3**: anche giochi e intro riempiono la finestra del proiettore.
- Le parole non si spezzano più a metà: se non entrano, il testo si riduce.
- **Misure (QA visiva)** a 1366×768, 1600×900, 1920×1080 e 1024×768, in % dell'altezza:

  | Elemento | RC2-A.1 | RC2-A.2 |
  |---|---|---|
  | candidati Indovina | 2,2 | 4,8–4,9 (3,6 in 4:3) |
  | indizio | 3,1 | 5,9 |
  | nomi Abbinamenti | 2,1 | 5,6–5,8 |
  | parole Ghigliottina | 3,6 | 6,8–8,1 |
  | parola finale | 6 | 14,5 |
  | parole Staffetta | 4 | 10,6 |

## 2. Schermata INTRO di ogni gioco (aggiunta richiesta durante il lavoro)
- **Stato reale del flusso** (`state.arcade.intro`), non un overlay: `startArcade` la attiva una volta per ogni avvio del gioco.
  - **Contenuto**: nome grande del gioco, payoff, due istruzioni essenziali e il punteggio reale. Senza tablet compare anche la regola a rango.
  - **Non sparisce da sola**: il pulsante principale è **▶ AVVIA &lt;GIOCO&gt;**, che entra nel gioco e lo avvia. In alternativa: «MOSTRA IL GIOCO SENZA AVVIARE» o salta.
  - **Nessuna intro per i passaggi interni**: coppie della Ghigliottina, parole della Staffetta, ↺ RIPETI MANCHE.
- **Punteggio mostrato**:
  - Photopuzzle, Indovina, Abbinamenti: «Risposta corretta: 200–300 pt in base alla velocità»;
  - Ghigliottina: «Ogni scelta corretta: +10 pt» · «Risposta finale corretta: 200–300 pt in base alla velocità»;
  - Staffetta: «Ogni parola corretta: 50–100 pt in base alla velocità».
- **Progressione della regia**: scaletta → intro → gioco → risultato del gioco → scaletta.

## 3. RISULTATO DEL GIOCO
- **Alla fine di ogni gioco** il primo AVANTI conferma i punti (come prima) e mostra **RISULTATO DEL GIOCO**; il secondo AVANTI prosegue. Funziona in archivio e in scaletta, e non ricompare.
- **Per ogni squadra**: risposta (o GIUSTA/ERRATA se inserita a mano), esito, tempo e **punti di questo gioco**.
  - Ghigliottina, parziali: «SCELTE 3/5 +30 PT · FINALE ✓ +290».
  - Staffetta, una casella per parola: «1 ✓ +92 · 2 ✗ 0 · 3 Ø 0».
- **Mai** classifica, totali della partita, podio o posizioni. La classifica resta solo su ★ CLASSIFICA.
- Nella Staffetta il risultato arriva dopo l'ultima parola (PAROLA SUCCESSIVA conferma ogni parola); «FINE STAFFETTA: RISULTATO →» chiude prima.

## 4. Testi del punteggio chiari
- **Eliminato «200 + bonus»** ovunque: palco, regia, guide, descrizione del profilo e commenti.
  - Domande: «✓ Corretta: 200–300 pt in base alla velocità · ✗ Errata −100 · Ø Nessuna risposta 0».
  - Ogni gioco mostra sul palco la propria regola (`SC.gameRules`), unica fonte per palco, regia e intro.
- **COME SI GIOCA**: col profilo 200–300 diceva «200 · 200 · 200…»; ora riporta la regola vera e quelle di Ghigliottina e Staffetta.

## 5. Ghigliottina — nuovo punteggio
- **Ogni scelta A/B è un micro-round** (scala `gh_pair`), confermato nel momento della scelta: +10 per ogni squadra che ha scelto giusto, errata 0, omessa 0.
  - Ogni squadra è valutata da sola; la maggioranza dei tablet resta **solo la scelta scenica** sul palco.
  - Squadre senza tablet: nella scheda PUNTI il docente preme A / B / Ø per ognuna prima di SCEGLI A/B. Una scelta a mano prevale sul voto del tablet.
  - Il round riusa l'id del voto A/B già aperto sui tablet, quindi il server verifica i voti reali.
- **Parola finale**: come una domanda standard, 200–300 per velocità, errata −100. Con 5 coppie giuste e finale immediata il **massimo è 350**.
- **Annullare una Ghigliottina in corso** (✕ ANNULLA ROUND) annulla anche le coppie già confermate (`voidGameRounds`), come per gli altri giochi.

## 6. Catena / Staffetta — punteggio per parola
- **Ogni parola è un micro-round** (scala `chain_link`, già un round per parola, ora con la sua scala): `round(100 − 50 × tempo / tempo disponibile)`, tra 50 e 100. Errata 0, omessa 0.
- Le parole omesse **non consumano** le 3 omissioni gratuite.
- Nessuna normalizzazione del totale; nessun vincolo nuovo sui pacchetti.

## 7. Input manuale senza tablet
- **Domande e risposte equivalenti** (finale della Ghigliottina, Photopuzzle, Indovina, Abbinamenti): le corrette valgono **300, 290, 280…** nell'ordine di registrazione, minimo 200.
- **Staffetta**: **100, 95, 90…**, minimo 50.
- Errate e omesse non consumano il rango.
- **Round misti** (almeno un tablet che ha risposto davvero): una corretta inserita a mano porta tutte le corrette del micro-round al minimo (200 o 50). Errate e omesse a mano non tolgono la velocità.
- **Difetto corretto in regia**: il riquadro «Punti di questo round» diceva «corrette a 200» anche senza nessun tablet. Il risultato del round dice «senza tablet: 300, 290, 280…» e «1ª corretta registrata».

## 8. Architettura dei punteggi
- **Invariata la catena** record grezzi → score event → totali derivati.
- **Nuovi helper** in `scoring.js`: `speedRangePoints`, `rankRangePoints`, `SCALES`, `scaleFor`, `countsOmissions`, `hasTabletAnswer`, `gameRules`, `manualRules`.
- **La scala viaggia ovunque**: è salvata nel round e in ogni score event, va al server nel commit, e la usano ricalcolo, rinumerazione delle omissioni e conteggio delle omissioni gratuite. Il server la conserva anche dopo il riavvio.
- **Retrocompatibilità**:
  - i round senza scala (fino alla RC2-A.1) mantengono le loro regole, anche se ricalcolati: nessun ricalcolo retroattivo;
  - un round riaperto tiene la sua scala;
  - i profili storici non cambiano.
- **CSV**: contratto v2 invariato, perché `EXPORT_CSV.md` vieta di cambiare nomi e ordine delle colonne. Coppie e parole sono righe con il proprio `round_id` e i propri punti.
- Dettagli in `ARCHITECTURE.md` §3.1–3.2.

## 9. Tastiera delle pulsantiere con cursore
- **Il testo è un vero `<input>`** con cursore (`inputmode="none"`: niente tastiera di sistema dove il browser lo consente; se compare su browser vecchi, funziona comunque).
  - Toccare il testo sposta il cursore; trascinare seleziona.
  - I tasti della tastiera inseriscono nel punto del cursore e una selezione viene sostituita.
  - ⌫ cancella la selezione oppure il carattere precedente; CANCELLA svuota.
  - Lo SPAZIO non va all'inizio né raddoppia; mai oltre il limite di caratteri.
- **Funzione pura `editText()`** in `js/player.js` (testata in Node). I tasti non rubano il fuoco al campo; con un testo lungo il campo scorre fino al cursore.
- **Tasti invariati**: alti almeno 44 px (96 px su telefono verticale nel test, 44 in orizzontale).
- **Difetto corretto durante la verifica**: con il campo a fuoco, dopo INVIA la pulsantiera restava su «INVIO…». La vecchia regola `keepText` non era mai scattata perché nessun elemento aveva quell'id. Ora conferma, pausa, fine tempo e soluzione ridisegnano sempre.

## Test
- **Nuovi**: `tests/rc2a2_gameplay.test.js`, 25 test.
  - A. velocità;
  - B. senza tablet;
  - C. round misti;
  - D. Ghigliottina, compreso un voto reale sul server;
  - E. Staffetta;
  - F. tastiera;
  - G. ripresa, ricalcolo, server con riavvio, report e CSV;
  - intro e risultato del gioco, testi.
- **Test della base aggiornati per il comportamento approvato**, con commento RC2-A.2:
  - `rc2a1_hotfix.test.js`: Staffetta 15 s su 45 s = 83 invece di 267 (55 s → 86 invece di 273); un Photopuzzle con una sola corretta a mano e nessun tablet vale 300 invece di 200;
  - `classroom_control.test.js`: la scelta A/B passa a `ghCommitPair` (stub nel test);
  - `session_planner_370.test.js`: estratte `gameResultsStep`/`gameRounds` (AVANTI passa dal risultato del gioco); versione `1.0.0-rc2a.2`.
- **Totale**: **307 superati, 0 falliti** (282 + 25).
- **Browser reale** (Playwright + Chromium):
  - `tests/e2e/visual_games.cjs`: 84 schermate, nessun problema;
  - `tests/e2e/keyboard_caret.cjs`: 13 verifiche.
- **Simulatore**: 2/6/15/30 pulsantiere, nessuna risposta persa né duplicata.
- **Risultati**: `QA/TEST_RESULTS_1.0_RC2A2.md`.
