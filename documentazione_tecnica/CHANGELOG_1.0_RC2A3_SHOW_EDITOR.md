# Il Secchione · 1.0 RC2-A.3 SHOW UX FIX + FASE B1 EDITOR GIOCHI — 7 ottobre 2026

Seguito della RC2-A.2 GAMEPLAY, sullo stesso branch della PR #1 e non da `main`. Con questa versione **inizia la Fase B1**, l'editor dei giochi da zero. Nessun gioco nuovo, nessun pacchetto modificato, nessun cambio al punteggio.

- **Base**: RC2-A.2 (`fcf228d`), 307/307 test verdi.
- **Versione**: `1.0.0-rc2a.3`.

## P0 · Tendina del gioco persistente, controllata dal docente
- **Sostituisce l'intro breve della RC2-A.2.** È uno **stato vero** del gioco (`arcade.curtain`), non un overlay.
  - Scelto il gioco, il proiettore mostra la tendina e **ci resta finché non la toglie il docente**: nessun timer la fa sparire.
  - Cambiare manche, immagini o parole sotto la tendina non la tocca.
- **Nessuna esposizione anticipata**: finché la tendina è attiva, il palco pubblico (finestra del proiettore, `/show`) riceve **solo** l'HTML della tendina, senza nessuna parola, immagine o lista del gioco nel DOM.
  - L'anteprima della regia mostra invece il gioco preparato, con l'avviso «SUL PROIETTORE C'È LA TENDINA».
- **Comandi della regia**:
  - **▶ TOGLI TENDINA E AVVIA** (Spazio);
  - **TOGLI TENDINA (SENZA AVVIARE)**;
  - **▣ MOSTRA TENDINA** per rimetterla, mai mentre il tempo scorre;
  - tasto **T** per mostrarla o toglierla.
- **Contenuto**:
  - titolo enorme del gioco (15% dell'altezza in 16:9), payoff, due istruzioni essenziali, punteggio RC2-A.2 in riquadri grandi;
  - regola senza tablet quando non ci sono tablet;
  - **istruzione facoltativa del pacchetto** (nuovo campo `instruction`);
  - colore e simbolo di sfondo diversi per ogni gioco, nessuna mascotte.
- **Adattamento**: `stage-fit.js` (`fitCurtain`) riduce i testi solo se qualcosa non entra (4:3, istruzioni lunghe).

## P0 · Layout dedicati, contenuto prima di tutto
- **Nuova cornice comune `gameFrame`**: intestazione su una riga con timer compatto, contenuto a tutto schermo, regola del punteggio in basso.
  - **Tolte la mascotte, il logo e la colonna destra** che nella RC2-A.2 occupava il 14% della larghezza.
  - In 4:3 il tema della manche sparisce dall'intestazione per lasciare spazio a titolo e timer.
- **Un layout per gioco**:
  - **Indovina**: indizio in alto a tutta larghezza come testo dominante, indizi precedenti sotto; alternative grandi su 2–4 colonne a tutta altezza. Niente vuoto centrale.
  - **Abbinamenti**: immagini più grandi (sempre `contain`, mai `cover`) con numeri da 8% dell'altezza; nomi A–D a tutta altezza; alla soluzione la lettera giusta compare enorme sull'immagine.
  - **Photopuzzle**: immagine il più grande possibile (`cover` e punto focale invariati), griglia visibile, colonna stretta per le corrette, soluzione al 9% dell'altezza.
  - **Ghigliottina**: parole A/B a tutta altezza; parola finale gigante; il montepremi scenico resta una riga discreta.
  - **Staffetta**: percorso dei passaggi in alto (risolti, attuale, da fare), parola di partenza e parola da trovare enormi.
- **Misure** (QA visiva, % dell'altezza, 1366×768; tra parentesi 1024×768):

  | Elemento | RC2-A.2 | RC2-A.3 |
  |---|---|---|
  | alternative Indovina | 4,9 (3,6) | 6,7 (5,0) |
  | indizio | 5,9 (4,4) | 7,7 (5,8) |
  | parole A/B Ghigliottina | 8,1 | 16,5 (15,3) |
  | parola finale | 14,5 | 21,8 |
  | parole Staffetta | 10,6 (9,2) | 12,5 in gioco, 15,2 alla soluzione (9,3 / 14,9) |
  | soluzione Photopuzzle | 6 | 9 |
  | numeri Abbinamenti | 4,2 | 5,4 |
  | nomi Abbinamenti | 5,8 (5,6) | 6,3 (5,4) |
  | titolo della tendina/intro | 13 (11,2) | 15 (12,5) |

  In 4:3 i nomi degli Abbinamenti sono leggermente più piccoli di prima (5,6 → 5,4), perché le immagini ora occupano il 60% della larghezza.

## P1 · Fase B1: editor dei giochi da zero (Pack Studio)
- **Barra CREA DA ZERO**, sempre visibile sotto le schede: **＋ DOMANDA**, **＋ PHOTOPUZZLE**, **＋ INDOVINA**, **＋ ABBINAMENTO**, **＋ PAROLA SEGRETA**, **＋ STAFFETTA**. Ognuno crea il contenuto e apre il suo modulo dedicato (i moduli esistevano già e restano). Duplica, sposta ed elimina restano disponibili.
- **Abbinamento rifatto** con un flusso a tre passi:
  1. **Immagini**: le 4 immagini, dal PC o dalla libreria;
  2. **Voci A–D**, nell'ordine che si preferisce;
  3. **Coppie**: per ogni immagine si sceglie la voce corretta, con riepilogo «1 → C Colosseo».
- **Validazione chiara**: «la voce C è abbinata a più immagini (1 e 2)», «la voce B non è abbinata a nessuna immagine».
- **Formato invariato**: nel pacchetto resta quello di sempre (`names[i]` = voce dell'immagine *i*); voci e coppie sono solo dati della bozza.
- **Istruzione sulla tendina**: campo facoltativo per ogni gioco (massimo 160 caratteri). È validato da `packs.js` e ignorato dai programmi precedenti.
- **Accesso dalla regia**: scheda GIOCHI → **✏ CREA NUOVI GIOCHI (PACK STUDIO)**.
- **Difetto preesistente corretto**: chiudendo una bozza subito dopo una modifica, il controllo ritardato dello Studio lavorava su una bozza già chiusa (errore JavaScript «reading 'manifest'»). L'ha trovato il test e2e.
- **Limite dichiarato**: Abbinamenti resta a **4 immagini e 4 voci**, perché il motore e il formato dei pacchetti supportano esattamente 4 coppie (A–D). Portarlo a un numero variabile richiede di cambiare motore e formato.

## Test
- **Nuovi**: `tests/rc2a3_show_editor.test.js`, 10 test:
  - tendina come stato persistente;
  - comandi mostra/nascondi nelle fasi giuste;
  - nessuna esposizione anticipata;
  - contenuto della tendina;
  - layout senza mascotte;
  - Abbinamento da zero con salvataggio e riapertura;
  - validazione degli Abbinamenti;
  - Indovina e Photopuzzle da zero con duplica, sposta ed elimina;
  - compatibilità dei pacchetti e del campo `instruction`;
  - CREA DA ZERO.
- **Aggiornati**: in `rc2a2_gameplay.test.js` i 2 test sull'intro sono stati spostati e riscritti per la tendina; `session_planner_370.test.js` per la versione.
- **Totale**: **315 superati, 0 falliti**.
- **Browser reale** (Playwright + Chromium):
  - `visual_games.cjs`: 84 schermate a 4 risoluzioni, nessun problema; tendina senza contenuti nel DOM del proiettore, anche cambiando manche, per tutti i 5 giochi;
  - `keyboard_caret.cjs`: 13 verifiche;
  - nuovo `studio_create.cjs`: 9 verifiche (domanda, Photopuzzle, Indovina e Abbinamento creati da zero solo con l'interfaccia, salvati, verificati su disco, riaperti).
- **Simulatore**: 2/6/15/30 pulsantiere senza regressioni.
- **Risultati**: `QA/TEST_RESULTS_1.0_RC2A3.md`.
