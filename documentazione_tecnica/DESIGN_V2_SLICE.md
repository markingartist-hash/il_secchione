# Il Secchione · Redesign visivo V2 — Fase 2, vertical slice

- **Base**: IL SECCHIONE TRAINING EDITION RC1.5 (`1.0.0-rc1.5`), commit «Baseline RC1.5» di questo branch. Nessun legame con la linea RC2-A.x.
- **Branch**: `design/v2-rc1.5`. Nessuna fusione.
- **Percorso coperto**: HOME → REGOLE → DOMANDA → REVEAL → CLASSIFICA ROUND → CLASSIFICA (generale e FINALE).
- **Fuori ambito, non toccati**: Photopuzzle, Indovina, Abbinamenti, Parola Segreta, Staffetta, regia, pulsantiere, Pack Studio. Mantengono la grafica RC1.5.
- **Motore, server, WebSocket, punteggio, formato dei pacchetti**: non modificati.

## File
| File | Cosa |
|---|---|
| `css/v2-tokens.css` (nuovo) | `@font-face` offline, palette, misure, tempi. Solo variabili. |
| `css/show-v2.css` (nuovo) | Tutte le regole della slice, confinate sotto `.v2`. Caricato dopo `show.css` (e `classroom.css` nella regia). |
| `assets/fonts/` (nuovo) | Barlow Condensed 600/700/800 e Inter 400/600/700/800, sottoinsieme *latin*, woff2. Licenze: `OFL_BarlowCondensed.txt`, `OFL_Inter.txt`. |
| `assets/brand/logo_v2*.svg` (nuovi) | CORE LOGO vettoriale: orizzontale, compatto, monocromatico, micro, simbolo. |
| `tools/brand/` (nuovo) | Generatore del logo (solo sviluppo). |
| `js/app.js` | Riscritti solo i template `homeHTML`, `rulesHTML` (più il nuovo `rulesModel`), `questionHTML`, `roundResultsHTML`, `leaderboardHTML`. Aggiunta la costante `V2_LOGO`. La finestra del proiettore carica anche i due CSS nuovi. |
| `index.html`, `show.html` | Due `<link>` in più. |
| `tools/asset_audit.js` | Origine e licenza del logo V2. |
| `tests/v2_slice.test.js` (nuovo) | 7 test. |
| `tests/e2e/v2_slice_visual.cjs` (nuovo) | QA visiva in browser con misure automatiche. |

`show.css` non è stato modificato.

## Decisioni applicate
- **Caratteri**:
  - Barlow Condensed per titoli, numeri ed etichette;
  - Inter per domande, risposte e testi;
  - fallback `Segoe UI, Arial, sans-serif`;
  - nessuna risorsa online.
- **Logo, direzione B**:
  - etichetta «il» inclinata, con il cervello rosa come puntino della i;
  - SECCHIONE pesante e condensato;
  - occhiali pixel appoggiati su «HIO» come firma;
  - 100% vettoriale, senza testo né immagini dentro l'SVG.
  - **HERO LOCKUP** = logo + mascotte originale, composti in pagina (Home; Regole con la mascotte HERO; finale).
- **Palette**:
  - un colore strutturale (blu notte → blu palco);
  - lettere A ciano, B blu-viola, C arancio, D magenta;
  - lime solo per corretto/successo, rosso solo per errato;
  - carte neutre.
  - Al reveal lo stato sostituisce l'identità della lettera (corretta: badge lime e «✓ ESATTA»; errate: badge con anello rosso e «✗»). Mai solo colore.
- **Regole**: `rulesModel(profilo, astensioniGratuite)` legge tutto da `SecchioneScoring.getProfile()` / `rankPoints()` e da `FREE_OMISSIONS`. Nessun numero nel template.
  - Show: «DA +200 A +300», «DA −50 A −200», «0 PUNTI PER LE PRIME 3 · DALLA 4ª ASTENSIONE: COME UNA RISPOSTA ERRATA»;
  - Didattico: «+1 PUNTO», «0 · NESSUNA PENALITÀ»;
  - Classico v3: «+300 · +275 · +250…», «−100».
  - Un profilo con altri numeri cambia la schermata da solo (test).
- **Mascotte**:
  - **HERO**: Home, Regole, 1° posto della finale (posa *celebrate*, con coriandoli e «CAMPIONI!»).
  - **SUPPORT**: classifiche (posa *present*, ridotta, in colonna laterale). Con più di 8 squadre la colonna sparisce; resta solo la HERO piccola alla vittoria.
  - **OFF nelle domande** (Fase 2B): nessuna mascotte nella zona contenuti delle MCQ, a qualunque densità.
  - Nessun file della mascotte creato, ridisegnato o modificato. Il ritaglio statico di `secchione_a` approvato non è servito.
- **Timer**: anello `conic-gradient`, numero a circa il 13% dell'altezza (12,6 cqh contro 4,15 di RC1.5). Ciano > 10 s, ambra ≤ 10 s, rosso ≤ 5 s con leggero pulse (scala 1 → 1,04), nessun lampeggio. Si riduce con la densità del testo (10 e 8,6 cqh).
- **Movimento**: 4 famiglie, tutte tra 150 e 500 ms:
  - ENTER 220 ms;
  - REVEAL 320 ms;
  - SCORE 250 ms con ritardo a cascata RC1.5;
  - VICTORY 500 ms.
  - Spente con `prefers-reduced-motion` e con il pulsante movimento della regia (`motionOff`).

## Leggibilità: dimensioni del testo (% dell'altezza del palco)
| Caso | Domanda RC1.5 → V2 | Risposte RC1.5 → V2 |
|---|---|---|
| normale | 4,5 → **5,4** | 2,9 → **3,6** (3,9 in griglia 2×2) |
| con immagine | 4,35 → **4,8** | 3,08 → **3,3** |
| denso | 4,45 → **4,5** | 3,15 → **3,15** |
| molto denso | 4,05 → **4,1** | 3,08 → **3,08** |
| molto denso con immagine | 3,92 → **3,95** | 3,02 → **3,02** |

- **Valori V2**: misurati in browser. Inter ha l'occhio più grande di Segoe UI: a parità di valore il testo appare più grande.
- **Spazio per i testi lunghi**: viene da colonna e timer più piccoli, immagine a 20 / 15,5 / 11,5% (soglie di `readability.js`), niente riga delle regole nel piè di pagina, gap e padding ridotti.

## QA eseguita
- **Suite**: `node tests/run.js` → 263 superati, 4 falliti.
  - I 4 falliti sono gli stessi della base RC1.5 (256/260) e dipendono da file esclusi dal pacchetto sorgente: master della mascotte, `GUIDA_DOCENTE.html`, `INIZIA_QUI.html`.
  - I 7 nuovi test V2 passano.
  - Un test RC1.x controlla un testo dei risultati («EX AEQUO (corretta inserita a mano)»): il testo è stato mantenuto, il test non è stato toccato.
- **Simulatore**: `node tools/simulate_players.js` → 2/6/15/30 pulsantiere, nessuna risposta persa o duplicata.
- **QA visiva** (`tests/e2e/v2_slice_visual.cjs`): 230 schermate.
  - **Scenari**:
    - 6 squadre a 1920×1080, 1600×900, 1366×768, 1280×720 e 1024×768;
    - 3 / 12 / 30 squadre a 1920, 1366 e 1024;
    - finestra del proiettore aperta con APRI.
  - **Casi**:
    - domanda normale, con immagine, densa, molto densa;
    - risposte oltre 100 caratteri;
    - immagine + molto densa;
    - timer ambra e rosso;
    - regole con tre profili;
    - classifica del round, generale, finale (intro, in corso, prima del 1°, vincitore);
    - nomi lunghi.
  - **Esito**: 0 testi tagliati o fuori dal palco, 0 errori JavaScript.
  - **Copia del CSS nella finestra del proiettore**: nessuna dichiarazione persa. La QA ha trovato e fatto correggere un difetto reale: Chrome scartava le scorciatoie `font:`/`border:` con `var()` quando copiava le regole nel popup.
- **E2E RC1.5 esistente** (`tests/e2e/run.cjs`): stesso esito prima e dopo (2 PASS, poi si ferma su `#launchQuestionBtn`, un selettore non più presente nella regia RC1.5). Non è stato toccato.

## Compromessi e limiti noti
- **4:3**: il palco resta 16:9 con bande nere, come in RC1.5. Il testo in cqh scala di conseguenza.
- **Logo**: i giochi e la tendina di transizione usano ancora il logo RC1.5. La transizione è comunque invisibile in RC1.5 (`opacity:0`).
- **Nomi delle squadre**: la regia li tronca a 40 caratteri (comportamento RC1.5). Nelle righe compatte le etichette vanno su una riga con i puntini; la spiegazione dell'ex aequo resta nella legenda.
- **Piè di pagina della domanda**: niente più riga tecnica con le regole durante il gioco (restano nella schermata REGOLE e nella regia). Lo stato (RISPONDETE, TEMPO CHIUSO…) è sotto il timer.
- **Classifica finale oltre 17 squadre**: le carte dal 4° posto in giù mostrano posizione, nome e punti, senza ✓ ✗ Ø.
- **Animazioni al reveal**: si ripetono a ogni nuovo disegno del palco (stesso comportamento delle animazioni RC1.5).

## Fase 2B · polish della slice
Solo grafica e UX: motore, punteggio, rete, pacchetti, logica del reveal, livelli di densità e responsive invariati.

1. **Domanda breve** (classe `short`, cioè `normal` senza immagine):
   - il blocco domanda + risposte occupa circa il 59% del palco, circa il 70% dello spazio utile (prima circa il 45%);
   - domanda 6,4% dell'altezza fino a 60 caratteri (`qBrief`), 5,8% oltre (prima 5,4);
   - risposte 4,6% nella griglia 2×2 e 4,2% in elenco (prima 3,9 e 3,6);
   - card alte 18 o 10,5 cqh, badge lettera 8 cqh;
   - timer invariato.
   - Con la soluzione aperta si stringono righe e padding, mai il testo.
   - `dense` e `veryDense` sono invariate.
2. **Mascotte tolta da tutte le domande**:
   - HERO: Home, Regole e Finale; in Home e Regole è specchiata, così indica i contenuti;
   - SUPPORT: classifiche.
3. **Grammatica grafica V2** (`V2_SLASH`, `V2_BOLT`, `V2_BRAIN`):
   - doppio slash magenta/ciano davanti ai titoli;
   - scintille vicino alla mascotte;
   - cervello rosa nella Home e nel logo.
   - Elementi solo decorativi, nascosti nelle domande dense, molto dense o con immagine.
4. **Classifiche adattive** `teamsFew` (2–6), `teamsMedium` (7–12), `teamsMany` (13+):
   - con poche squadre righe e carte diventano contenitori CSS: posizione, nome, punti ed esito scalano con l'altezza della riga;
   - le righe sono distribuite in verticale;
   - nome di una squadra con 6 squadre nel round: da 3,6 a 4,7% dell'altezza;
   - ranking invariato.
5. **Finale**:
   - **vincitore unico** (`soloWin`): riga del 1° più alta (1,9 fr contro 1,45), bordo oro più forte, HERO, «CAMPIONI!», coriandoli;
   - **ex aequo reale** (`tieWin`): «CAMPIONI EX AEQUO», tutte le prime con la stessa grafica e lo stesso luccichio, podio a pari altezza con più di 8 squadre.
   - Il calcolo della classifica non è cambiato.
6. **Logo, polish della direzione B**:
   - etichetta «il» più piccola, appoggiata sulla linea di base;
   - cervello rosa che esce dall'etichetta;
   - occhiali pixel più grandi con contorno più marcato;
   - sottolineatura ciano asimmetrica (con l'etichetta forma una staffa a L) chiusa da due tagli magenta/ciano.
   - Sempre 100% SVG; variante monocromatica aggiornata.
7. **Regole**: impostazione invariata, valori dal motore. Aggiunti lo slash nel titolo, le scintille e la mascotte rivolta verso i pannelli.

**QA Fase 2B**
- **Suite**: 263 superati, 4 falliti (gli stessi della base).
  - Un test RC1.x richiede `<h1>CLASSIFICA</h1>` letterale: lo slash è stato messo fuori dal titolo, il test non è stato toccato.
  - I test V2 sono aggiornati: niente mascotte nelle domande; vincitore unico contro ex aequo.
- **Simulatore**: 2/6/15/30 OK.
- **QA visiva**: 260 schermate (scenari main, t3, t12, t30, tie, popup), 0 testi tagliati o fuori dal palco, 0 errori JavaScript, nessuna regola CSS persa nella finestra del proiettore.
- **Confronto con la prima slice**: `QA_V2/V2_SLICE_POLISH_BEFORE_AFTER.jpg`.
