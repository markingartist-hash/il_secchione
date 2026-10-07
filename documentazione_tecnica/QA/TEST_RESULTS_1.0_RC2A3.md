# Risultati dei test · 1.0 RC2-A.3 SHOW UX FIX + FASE B1

**Ambiente**: container cloud Linux, Node v22.22.0, Chromium di Playwright 1.56.1 headless. Il Node 24 portatile per Windows della distribuzione non era disponibile.

## 1. Suite automatica — `node tests/run.js`
| | Superati | Falliti |
|---|---|---|
| Base RC2-A.2 | 307 | 0 |
| RC2-A.3 | **315** | **0** |

10 nuovi test in `tests/rc2a3_show_editor.test.js`. I 2 test sull'intro della RC2-A.2 sono stati sostituiti da quelli sulla tendina.

## 2. QA visiva del palco — `tests/e2e/visual_games.cjs` (eseguita davvero)
- **Configurazione**: server reale, regia `/host` con 6 squadre, quattro `/show` a **1366×768, 1600×900, 1920×1080, 1024×768**.
- **Schermate**: per ogni gioco tendina, gioco in corso, soluzione e risultato del gioco. Totale 84, **0 testi tagliati o fuori dal palco, 0 errori JavaScript**. Le ho guardate anche una per una.
- **Tendina**, per ognuno dei 5 giochi e a tutte e 4 le risoluzioni:
  - il DOM del proiettore contiene la tendina e **nessun** elemento del gioco (alternative, indizi, voci, immagini, coppie, parole, puzzle), **anche dopo aver cambiato manche** sotto la tendina;
  - l'anteprima della regia mostra il gioco preparato con l'avviso.
- **Difetti trovati e corretti durante la QA (tutti in 4:3 o di interlinea)**:
  - intestazione troppo larga che spingeva fuori il timer;
  - titolo «PAROLA SEGRETA · FINALE» troppo lungo;
  - tendina che si riduceva al minimo per l'interlinea del titolo;
  - timer non allineato a destra in 4:3.
- **Evidenze** in `v1.0-rc2a3/`:
  - `show_giochi_<risoluzione>.jpg`: tutte le schermate di una risoluzione;
  - schermate a piena grandezza;
  - `regia_anteprima_sotto_tendina.jpg`;
  - `visual_report.json`: misure del testo per schermata;
  - le schermate «prima» sono quelle della RC2-A.2 in `v1.0-rc2a2/`.

## 3. Pack Studio, creazione da zero — `tests/e2e/studio_create.cjs` (eseguita davvero)
- **9 verifiche superate in un browser reale, solo con l'interfaccia**:
  1. nuovo pacchetto; barra CREA DA ZERO con 6 pulsanti;
  2. domanda compilata dal modulo;
  3. Photopuzzle con immagine caricata dal PC e istruzione per la tendina;
  4. Indovina con 4 alternative, soluzione scelta e 3 indizi;
  5. Abbinamento con 4 immagini dal PC, voci scritte in ordine diverso dalle immagini e coppie impostate;
  6. messaggio chiaro con una voce usata due volte;
  7. SALVA NELLA LIBRERIA;
  8. pacchetto su disco accettato dal Gestore Pacchetti, con `names` nell'ordine delle immagini e senza dati della bozza;
  9. riapertura dalla libreria con le stesse coppie.
- **Difetto preesistente trovato e corretto**: errore JavaScript dello Studio quando si chiude una bozza subito dopo una modifica.
- **Evidenze**: `v1.0-rc2a3/studio_abbinamento.png`, `studio_riaperto.png`, `studio_report.json`.
- Parola Segreta e Staffetta da zero sono coperte dai moduli già esistenti e dai test di modello. Nel browser ho provato i tre tipi richiesti esplicitamente (Abbinamento, Indovina, Photopuzzle) più la domanda.

## 4. Tastiera — `tests/e2e/keyboard_caret.cjs`
13 verifiche superate, invariata rispetto alla RC2-A.2.

## 5. Simulatore di rete — `node tools/simulate_players.js`
2/6/15/30 pulsantiere: 10/30/75/150 risposte, ack mediana 1 ms, nessuna risposta persa né duplicata (`v1.0-rc2a3/simulation_RC2A3.txt`).

## 6. Non verificato (dichiarato)
- **Dispositivi reali**: proiettore, leggibilità dal fondo dell'aula, iPad/Safari, tablet reali.
- **Finestra popup del proiettore aperta dalla regia**: non provata nel browser automatico. È stato provato `/show`, che usa lo stesso `stageHTML()`, lo stesso CSS e lo stesso `stage-fit.js`.
- **Contenuti di altri pacchetti**: testi molto lunghi sono gestiti dal fit (testo ridotto fino al minimo e classe `tooLong`), ma non sono stati fotografati.
- **Abbinamenti con più o meno di 4 coppie**: non supportato dal motore (limite dichiarato).
- **Runtime Windows e ZIP portatile**: non disponibili. `SHA256SUMS.txt` non è stato rigenerato, come già nella RC2-A.2.
