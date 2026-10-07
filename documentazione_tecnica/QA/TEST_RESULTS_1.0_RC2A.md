# Risultati dei test · 1.0 RC2-A POST-PILOT

Data: 6 ottobre 2026 · Node v24.19.0 portable incluso · Windows 10 Pro 19045.

**Legenda del metodo:**
- **[ESEGUITO]**: test automatico eseguito, con risultato registrato.
- **[ESEGUITO · BROWSER]**: provato nel browser integrato dell'app Claude (Chromium 152), con un server locale e viewport emulate su una copia di lavoro che contiene anche un pacchetto di collaudo (`QA leggibilità`, non incluso nella release). Il tablet è una vera pagina `/player` collegata con il PIN. **Non sostituisce proiettore, tablet e aula reali.**
- **[NON VERIFICABILE]**: richiede hardware, browser o persone reali. Non eseguito.

## 1. Base [ESEGUITO]
1.0 RC1, ZIP `b4323ba3…fbd0e`: 256/256 checksum corretti, 250 test verdi prima di ogni modifica.

## 2. Test automatici [ESEGUITO]
`node tests/run.js` → **274 superati, 0 falliti** (log in `QA/v1.0-rc2a/tests-unit-integration.txt`).
- **Nuovi in `tests/rc2a_post_pilot.test.js` (24)**:
  - **formula**: tabelle 15 s e 45 s; 4 200 ms → 272; limiti 0 / scadenza / oltre la scadenza / negativo; tempi mancanti → 200; clamp su 430 valori;
  - **D1**: una corretta a mano → tutte 200; solo errate od omesse a mano → bonus mantenuto; Ø automatiche;
  - **D6**: profili classici e partite salvate invariati; migrazione una tantum delle preferenze;
  - **server**: +10 s e pausa (tempo disponibile 25 000 ms, pausa esclusa), il server corregge tempi falsi della regia, parità regia = server, persistenza dopo il riavvio, regola D1 sul server;
  - **regia**: tempo disponibile ad avvio, +10 s, riapertura, conferma, giochi; nessun ▲;
  - **CSV**: nuove colonne;
  - **tempi**: un solo punto, D4 (A/B/C/D con immagine = 15 s), contenuto prioritario, normalizzatore senza default, nessun 30/60 sparso nel codice, nessun minimo di 60 s, tablet = palco, Pack Studio con `timer.js`, Arte romana 3.6.0;
  - **risultato del round**: niente posizioni, podio, totali né «classifica», ordine corrette → errate → Ø, tempi «4,2 s», «senza bonus», «inserita a mano»;
  - **classifica**: fine contenuti senza classifica e AVANTI inerte; ★ CLASSIFICA a metà partita = proclamazione dall'ultimo, poi TORNA AL GIOCO allo stesso punto; fine scaletta;
  - **leggibilità**: limiti in % dell'altezza, ricerca della scala, minimo e `tooLong`, cablaggio su regia, finestra e `/show`, `ResizeObserver`;
  - **schermo intero**: pulsante, niente «clic ovunque», ESC e F, aiuto F11, regia;
  - **tastiera**: tutti i tasti richiesti, INVIA dentro la tastiera, cifre dietro 123, A/B/C/D senza tastiera, invio unico, conferma, tasti ≥ 44 px.
- **Test della base modificati** per comportamento approvato (elenco nel CHANGELOG): 9 file, ogni modifica con un commento «RC2-A».

## 3. Simulazione multi-tablet [ESEGUITO]
`tools/simulate_players.js` sul server reale (log in `QA/v1.0-rc2a/simulation.txt`). Nessuna risposta persa né duplicata; punteggi coerenti con il nuovo profilo.

| Tablet | Risposte | ack mediana | 95° perc. | max | Esito |
|---|---|---|---|---|---|
| 2 | 10 | 2 ms | 7 ms | 7 ms | ✓ |
| 6 | 30 | 2 ms | 7 ms | 8 ms | ✓ |
| 15 | 75 | 2 ms | 7 ms | 7 ms | ✓ |
| 30 | 150 | 3 ms | 5 ms | 11 ms | ✓ |

## 4. Browser [ESEGUITO · BROWSER]

### 4.1 Leggibilità: misure del palco (`/show`, domanda in corso)
Prima (RC1, domanda corta): 1366×768 → 38 / 25 px; 1920×1080 → 54 / 35 px; 1024×768 (4:3) → 26 / 17 px.

Dopo (RC2-A), dimensioni in px «domanda / risposte», nessun testo traboccante:

| Caso | 1366×768 | 1600×900 | 1920×1080 | 1024×768 (4:3) |
|---|---|---|---|---|
| Domanda corta, 4 risposte corte (griglia 2×2) | 48 / 37 | 56 / 43 | 67 / 52 | 48 / 37 |
| Domanda lunga (~240 caratteri) | 48 / 37 | 56 / 43 | 67 / 52 | 48 / 37 |
| 4 risposte lunghe (~90 caratteri) | 48 / 37 | 56 / 43 | 67 / 52 | 48 / 37 |
| 4 risposte lunghissime (199 caratteri) | 44 / 34 | 51 / 40 | 61 / 48 | 37 / 30 |
| Immagine + domanda + risposte corte | 48 / 37 | 56 / 43 | 67 / 52 | 48 / 37 |
| Immagine + domanda lunga + risposte da 90 caratteri | 40 / 32 | 47 / 37 | 57 / 45 | 33 / 26 (minimo) |
| Soluzione + spiegazione (spiegazione) | 20 px | — | — | — |

- **Difetto trovato e corretto durante il collaudo**: con immagine + testo lungo una vecchia regola CSS (`.textDense .hasArt`) riduceva il testo a 27/19 px, sotto il minimo. Ora la dimensione la decide solo `stage-fit.js`.
- **Ricalcolo automatico al cambio di dimensione**: funziona con la finestra visibile (`resize` e `ResizeObserver` arrivano, testo ricalcolato a 56/43 px passando a 1600×900). Con il pannello del browser nascosto il browser non disegna e non ricalcola: è un limite dell'ambiente di prova, ma va comunque controllato sul proiettore (§ 6).

### 4.2 Punteggio, risultato del round, classifica
| # | Prova | Esito |
|---|---|---|
| 1 | Domanda 15 s: tablet risponde in 12,4 s → «PUNTI DI QUESTO ROUND · Blu · 12,4 s · +218» | ✓ |
| 2 | + errata inserita a mano → Blu resta +218 | ✓ |
| 3 | + corretta inserita a mano → «CORRETTE A 200 PUNTI», tutte +200; nel risultato del round «senza bonus» | ✓ |
| 4 | Photopuzzle: tempo disponibile 45 000 ms (standard), risposta testuale corretta in 1 973 ms → +296; il server conferma lo stesso punteggio (`score.verified`, nessuna correzione) | ✓ |
| 5 | Risultato del round a 1366×768 e 1024×768: nessuna posizione, nessun totale, Ø in grigio neutro (prima toni oro, corretto) | ✓ |
| 6 | ★ CLASSIFICA a metà partita: intro «A METÀ PARTITA», 4 AVANTI = 4 posizioni, poi «TORNA AL GIOCO →» → domanda successiva | ✓ |
| 7 | Ultima domanda: AVANTI → risultato → AVANTI → «FINE DEI CONTENUTI» (nessuna classifica); ★ CLASSIFICA FINALE → proclamazione → ✓ TERMINA PARTITA → Home | ✓ |
| 8 | Avviso «senza risposta → Ø» (RC1) invariato nei giochi e nelle domande | ✓ |

### 4.3 Tastiera della pulsantiera (pagina `/player` vera, collegata con PIN)
Tasti e testo misurati con la tastiera aperta (Photopuzzle). In tutte le 8 dimensioni: nessuno scorrimento, nessun tasto fuori schermo, INVIA visibile.

| Dimensione | Altezza tasti | Larghezza lettere | INVIA | Testo digitato |
|---|---|---|---|---|
| 360×640 telefono | 71 px | 30 px | 98×71 | 33 px |
| 390×844 telefono | 96 px | 33 px | 108×96 | 44 px |
| 640×360 telefono orizzontale | 44 px | 59 px | 193×44 | 28 px |
| 844×390 telefono orizzontale | 44 px | 80 px | 259×44 | 28 px |
| 768×1024 tablet | 96 px | 69 px | 229×96 | 46 px |
| 800×1280 tablet | 96 px | 72 px | 239×96 | 46 px |
| 1024×768 tablet orizzontale | 88 px | 94 px | 311×88 | 40 px |
| 1280×800 tablet orizzontale | 92 px | 119 px | 393×92 | 42 px |

- **Limite noto**: sui telefoni in verticale una riga QWERTY di 10 tasti lascia ogni lettera larga 30–33 px (come le tastiere di sistema). L'altezza resta ≥ 44 px.
- **Prove funzionali** [ESEGUITO · BROWSER, con clic simulati]:
  - «VIA 'È», poi 123 → «1» → ABC;
  - CANCELLA;
  - **tre tocchi rapidi su INVIA → una sola risposta registrata dal server**;
  - schermata «✓ RISPOSTA REGISTRATA · VIA APPIA ANTICA».

### 4.4 Schermo intero
- **`/show`**: pulsante «⛶ SCHERMO INTERO» visibile, «nascondi» funzionante, nessun «clic ovunque».
  - In questo browser incorporato la richiesta di schermo intero **non riceve risposta**. Il pulsante mostra correttamente «Il browser non lo permette: premi F11» dopo 1,5 s; questo comportamento è stato aggiunto proprio dopo la prova.
- **Regia**: pulsante presente; lo schermo intero è negato dall'ambiente di prova.
- **Finestra del proiettore aperta da APRI**: il browser incorporato blocca le finestre popup anche con un clic vero, quindi **[NON VERIFICABILE qui]**. Il codice è lo stesso di `/show` per adattamento e pulsante, coperto dai test automatici.

### 4.5 Altro
- **Pack Studio**: campo durata vuoto con suggerimento «15» (domande) e «45» (giochi), elenco «Corta · 15 s», anteprima «30 TESSERE IN 45 SECONDI».
- **Console**: nessun errore su regia, palco e Studio. Sulla pulsantiera compaiono solo avvisi «navigator.vibrate bloccato finché non c'è un tocco reale» (comportamento già presente, dovuto ai clic simulati).

## 5. Pacchetto di consegna
Smoke test dallo ZIP estratto in una cartella con spazi: vedi il report di consegna.

## 6. Da verificare in aula [NON VERIFICABILE da qui]
1. **Proiettore reale, dall'ultima fila**: domanda corta, domanda lunga, risposte lunghe, immagine, soluzione con spiegazione.
   - Si legge la risposta più piccola (es. 26 px con immagine + testo lungo in 4:3)?
   - Il contrasto regge con le luci accese?
2. **Schermo intero sul proiettore**:
   - APRI → trascina → SCHERMO INTERO;
   - ESC (il pulsante ricompare);
   - di nuovo SCHERMO INTERO;
   - la finestra resta sul secondo schermo? Il testo si ricalcola dopo il passaggio a schermo intero?
3. **Proiettore 4:3 o 1280×800**: il palco della domanda riempie lo schermo senza bande nere?
4. **Tastiera su tablet e telefoni veri** (Android e iPad/Safari):
   - lettere «mancate» sui telefoni in verticale?
   - zoom indesiderato?
   - vibrazione e conferma chiare?
   - doppio tocco su INVIA.
5. **Ritmo della partita**:
   - il risultato del round senza totali mantiene la suspense?
   - il docente trova ★ CLASSIFICA quando la vuole e capisce FINE DEI CONTENUTI?
6. **Tempi**:
   - 15 s bastano per leggere 4 risposte lunghe?
   - 45 s per le risposte scritte sono giusti?
7. **Punteggio percepito**: le squadre capiscono 200 + bonus? Le classi miste accettano la regola D1?
8. **Pacchetti Barocco e Preistoria**: hanno ancora le durate 30/60 scritte; fino alla Fase B restano così.
