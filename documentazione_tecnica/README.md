# Il Secchione · 1.0 RC2-A.1 HOTFIX (base 1.0 RC2-A)

> **1.0 RC2-A.1** (6 ottobre 2026), hotfix senza nuove funzioni:
> - nei giochi la regia calcola già il bonus velocità con il tempo disponibile del round, come il server: nessuna correzione successiva;
> - il ricalcolo usa il tempo disponibile del round per i record storici;
> - nella checklist la riga Pulsantiere dice «N tablet collegati · M squadre manuali».
>
> Contiene anche la rettifica del report QA della RC2-A. Vedi [CHANGELOG_1.0_RC2A1_HOTFIX.md](CHANGELOG_1.0_RC2A1_HOTFIX.md) e [QA/TEST_RESULTS_1.0_RC2A1.md](QA/TEST_RESULTS_1.0_RC2A1.md).

## 1.0 RC2-A POST-PILOT (base 1.0 RC1)

> **1.0 RC2-A POST-PILOT** (6 ottobre 2026). Patch di gioco dopo tre sessioni reali in classe:
> - punteggio 200–300 (200 per la correttezza + bonus velocità misurato dai tablet);
> - tempi standard in `engine/timer.js` (15 s domande, 45 s immagini e risposte scritte);
> - risultato del round senza classifica, classifica solo su comando;
> - testo del palco adattato all'altezza dello schermo (anche in 4:3);
> - schermo intero esplicito;
> - nuova tastiera delle pulsantiere.
>
> Novità e test: [CHANGELOG_1.0_RC2A_POST_PILOT.md](CHANGELOG_1.0_RC2A_POST_PILOT.md) e [QA/TEST_RESULTS_1.0_RC2A.md](QA/TEST_RESULTS_1.0_RC2A.md). La Fase B (editor CONTENUTI incorporato) non è inclusa.

## Training Edition 1.0 RC1 (base v3.7.3)

> **Training Edition 1.0 RC1** (6 ottobre 2026). Release candidate per il corso docenti, in feature freeze.
> - **Il docente usa solo i tre documenti in radice**: `INIZIA_QUI.html`, `GUIDA_DOCENTE.html`, `RISOLUZIONE_PROBLEMI.html`.
> - **Questa cartella** contiene il materiale tecnico, spostato qui senza modifiche. I collegamenti relativi dei documenti storici (es. `CHANGELOG_V3_7_3.md`) puntano a file che ora stanno in questa stessa cartella.
> - **Novità e test**: [CHANGELOG_TRAINING_1.0_RC1.md](CHANGELOG_TRAINING_1.0_RC1.md) e [QA/TEST_RESULTS_TRAINING_1.0_RC1.md](QA/TEST_RESULTS_TRAINING_1.0_RC1.md).
> - **Test con un docente esterno**: [QA/CHECKLIST_DOCENTE_SCONOSCIUTO.md](QA/CHECKLIST_DOCENTE_SCONOSCIUTO.md).
>
> Il testo che segue è quello della v3.7.3: dove nomina `LEGGIMI.txt`, `GUIDA_RAPIDA_DOCENTE.md` o `SOLUZIONI_DOCENTE.html` "in radice", oggi quei file sono qui.

## Il Secchione v3.7.3 CONTENT IMPORT AND PODIUM REVEAL

**v3.7.3**: **📥 IMPORTA CONTENUTI**, un solo pulsante per qualunque file: il programma riconosce da solo archivio domande, archivio giochi, pacchetto completo o scaletta, dice che cosa succederà e propone il backup prima di sostituire. A fine partita, la **CLASSIFICA FINALE** è una proclamazione: ogni AVANTI rivela una posizione dall'ultima alla prima, e il 1° posto arriva per ultimo. Vedi [CHANGELOG_V3_7_3.md](CHANGELOG_V3_7_3.md) e [QA/TEST_RESULTS_V3_7_3.md](QA/TEST_RESULTS_V3_7_3.md).

**v3.7.2**: ottimizzazione della **tastiera testuale** e nuova **classifica del round a tutto schermo**. La v3.7.0 resta la base della Scaletta della puntata. Si scelgono domande e giochi da uno o più pacchetti, si ordinano e si salvano con un nome; in classe si preme quasi solo **AVANTI**. La **regia "one screen"** mostra, sempre in vista sopra le schede e anche durante i giochi, lo stato, una sola **azione principale** contestuale (AVVIA → RIVELA → AVANTI) e solo le azioni secondarie utili in quel momento. Vedi [CHANGELOG_V3_7_1.md](CHANGELOG_V3_7_1.md) e [QA/TEST_RESULTS_V3_7_1.md](QA/TEST_RESULTS_V3_7_1.md).

**v3.6.1**: patch nata dall'uso reale in classe. I giochi con risposta scritta hanno **almeno 60 secondi**; **PROSSIMA DOMANDA** chiude il round, assegna automaticamente le omissioni mancanti e registra i punti; i giochi mantengono la raccolta punti nella stessa scheda; il palco usa meglio lo spazio per testo e risposte e, dopo il reveal, mostra una **mini-classifica della singola domanda**. Ogni squadra ha **3 astensioni gratuite per partita**; dalla 4ª l'astensione resta registrata come omissione ma prende il punteggio di una risposta errata. La Staffetta separa chiaramente le parole composte (es. `ARA PACIS`). Vedi [CHANGELOG_V3_6_1.md](CHANGELOG_V3_6_1.md).

**v3.6.0**: controllo della regia durante la lezione, cioè modifica della domanda corrente senza perdere il contesto, round aperto immutabile, **ANNULLA** e **RIPETI DOMANDA**, stato delle pulsantiere sempre visibile, progresso, ricerca nell'Archivio, risposte alternative in Pack Studio e Ghigliottina A/B sui tablet. Vedi [CHANGELOG_V3_6_0.md](CHANGELOG_V3_6_0.md) e [QA/TEST_RESULTS_V3_6_0.md](QA/TEST_RESULTS_V3_6_0.md).

**Patch ANSWER_MATCHER**: [Matcher condiviso](ANSWER_MATCHER.md), normalizzazione, varianti e typo conservativi; UI, networking e formule di punteggio invariati.

**v3.5.4**: la v3.5.3_PACK_STUDIO con la **mascotte animata** (quattro pose reali che presentano, pensano, esultano e vanno nel panico), patch solo visuale: vedi [modifiche v3.5.4](CHANGELOG_v3.5.4_MASCOT_ANIMATED.md).

La v3.5.3 è basata sulla release conservativa v3.5.2_PILOT (correzioni QA invariate) con in più **Pack Studio**, l'editor grafico dei pacchetti, e i **CSV protetti per i fogli di calcolo**. **Node portable incluso: estrai tutto lo ZIP e fai doppio clic su AVVIA_IL_SECCHIONE.bat.** Non occorrono installazioni o npm. Vedi [modifiche v3.5.3](CHANGELOG_v3.5.3_PACK_STUDIO.md), [audit v3.5.2](AUDIT_v3.5.2_PILOT.md) e [modifiche v3.5.2](CHANGELOG_v3.5.2_PILOT.md).

Game show didattico per la classe, con **squadre**, **timer**, **classifica**, **5 giochi arcade** e **doppio schermo**.
La v3.5 elimina il collo di bottiglia emerso in classe: registrare le risposte delle squadre.

- **Modalità manuale** (nessun tablet): griglia `A B C D Ø` per squadra e tastiera rapida. Sei squadre si registrano con 7 tasti.
- **Modalità pulsantiere**: tablet, Chromebook o smartphone diventano pulsantiere `A B C D` + `INVIA`, collegati al PC del docente sulla rete locale. **Non serve Internet.**

Le due modalità si possono mescolare: le squadre con il tablet rispondono da sole, le altre si registrano a mano nella stessa griglia.

- **Gestore Pacchetti**: si importa un argomento nuovo con un solo file `.zip` (domande, giochi e immagini) e si cambia pacchetto senza riavviare e senza perdere squadre e punti. Si possono anche usare più pacchetti nella stessa partita.
- **Pack Studio**: il docente crea e modifica i pacchetti con moduli e pulsanti, cioè domande, manche speciali e immagini, con anteprima, controllo e salvataggio nella libreria. Non serve scrivere file JSON.

> La v3.0 originale non è stata modificata (`Il_Secchione_ARTE_ROMANA_v3.0.zip`). Questa cartella è una copia indipendente.

---

## Avvio rapido

### Uso senza tablet
1. Doppio clic su **`AVVIA_SENZA_TABLET.bat`** (oppure apri `index.html` con Chrome o Edge).
2. Aggiungi le squadre (colonna sinistra) e premi **▶ AVVIA QUIZ**, poi **▶ AVVIA DOMANDA** (o `Spazio`).
3. Alla fine del tempo registra le risposte nella griglia **RISPOSTE DELLE SQUADRE**. Con la tastiera: `A` `B` `C` `D` oppure `0` (omessa), un tasto per squadra. **Invio** conferma i punti, **→** passa alla domanda successiva.

### Uso con tablet
1. Doppio clic su **`AVVIA_IL_SECCHIONE.bat`** (Node portable è già incluso; vedi [NETWORK_SETUP.md](NETWORK_SETUP.md)). Si apre la regia nel browser e una finestra nera, il server, che va **lasciata aperta**.
2. Crea le squadre, poi premi **📱 PULSANTIERE (TABLET)**: compaiono **QR code** e **PIN**.
3. Le squadre inquadrano il QR (oppure aprono l'indirizzo mostrato), inseriscono il PIN e toccano il nome della squadra. In regia premi **✓ APPROVA TUTTE LE RICHIESTE**, poi **🔒 CHIUDI INGRESSI**.
4. **▶ AVVIA DOMANDA**: sui tablet compaiono `A B C D`. La squadra sceglie e preme **INVIA**: la risposta diventa definitiva. Quando tutte le squadre hanno il tablet, alla fine del tempo i punti si confermano da soli.

### Test rete
1. Avvia con `AVVIA_IL_SECCHIONE.bat`, apri **📱 PULSANTIERE** e premi **QR test rete**.
2. Da un tablet inquadra il QR (oppure apri `http://<indirizzo-del-PC>:8765/network-test`).
3. Se il tablet mostra **RETE OK** puoi usare le pulsantiere. Se la pagina non si apre affatto, la rete della scuola isola i dispositivi: usa l'hotspot del PC o un router dedicato, oppure la modalità manuale ([NETWORK_SETUP.md](NETWORK_SETUP.md)).

### Pacchetti (cambiare argomento)
1. Premi **📦 PACCHETTI** nella colonna sinistra.
2. **IMPORTA PACCHETTO** e scegli il file `.zip`, oppure trascinalo sulla finestra. Senza aprire la regia puoi anche trascinarlo su **`IMPORTA_PACCHETTO.bat`**. Funziona anche con lo ZIP di un'edizione v3, ad esempio `Il_Secchione_PREISTORIA_v3.0.zip`.
3. **ATTIVA** per giocarlo. Per una **sessione mista** spunta più pacchetti e premi **USA I SELEZIONATI**. Squadre e punti restano.

Due pacchetti di prova sono in `PACK_ESEMPI/`. Il formato e le regole sono in [PACK_FORMAT.md](PACK_FORMAT.md).

### Creare o modificare un pacchetto: Pack Studio
1. In **📦 PACCHETTI** premi **✏ PACK STUDIO** per un pacchetto nuovo, oppure **MODIFICA** sulla riga di un pacchetto. Puoi anche aprire `studio.html`.
2. Compila le schede **Informazioni**, **Domande**, **Manche speciali** e **Immagini**. L'**ANTEPRIMA** mostra la domanda come sullo schermo della classe.
3. In **Controllo e salvataggio** correggi gli eventuali problemi (cliccandoci sopra), poi **💾 SALVA NELLA LIBRERIA** oppure **⬇ ESPORTA ZIP**.

Con `AVVIA_IL_SECCHIONE.bat` i pacchetti vengono salvati nella cartella `packs/`; senza server, nell'archivio del browser. Il lavoro in corso viene salvato automaticamente come bozza. Guida completa: [PACK_STUDIO.md](PACK_STUDIO.md).

### Scaletta della puntata (v3.7.0)
1. Premi **📋 SCALETTA** nella colonna sinistra, poi **＋ NUOVA**, e dai un nome alla scaletta.
2. A sinistra spunta uno o più pacchetti e scegli **DOMANDE** o **GIOCHI**. Puoi cercare e filtrare per argomento e difficoltà. **＋** aggiunge un elemento, **＋ AGGIUNGI SELEZIONATI** quelli spuntati.
3. A destra ordina trascinando o con **↑ ↓**. **⧉** duplica un elemento (in classe diventa un nuovo round), **✕** lo toglie, **🔀 MESCOLA SOLO LE DOMANDE** lascia i giochi al loro posto.
4. **▶ AVVIA SCALETTA**: i pacchetti necessari si attivano da soli (squadre e punti restano). Poi premi **AVANTI**: chiude e registra l'elemento corrente e apre il successivo.

La scaletta si salva da sola e si riapre dall'elenco; **ESPORTA/IMPORTA** ne fa una copia in un file. Contiene solo riferimenti alle domande e ai giochi dei pacchetti, senza copiarli: se un contenuto non esiste più, compare come **MANCANTE** e viene saltato, mai sostituito.

### Importa contenuti (v3.7.3)
1. Premi **📥 IMPORTA CONTENUTI** nella colonna sinistra, oppure trascina il file in un punto qualsiasi della regia.
2. Il programma riconosce il file e mostra un riepilogo:
   - **archivio domande** (`.json` da ARCHIVIO → ESPORTA): sostituisce le domande del pack attivo;
   - **archivio giochi** (`.json` da GIOCHI → ESPORTA GIOCHI): sostituisce le manche dei tipi presenti nel file, gli altri restano;
   - **pacchetto completo** (`.zip`): viene installato nella libreria;
   - **scaletta**: viene aggiunta alle scalette.
3. Per domande e giochi scegli **⬇ ESPORTA BACKUP PRIMA DI CONTINUARE** (consigliato), **CONTINUA SENZA BACKUP** oppure **ANNULLA**.

Con il server i contenuti importati vengono salvati nel pacchetto installato (restano dopo la chiusura) e la versione precedente finisce nel cestino dei pacchetti.

### Ripristino sessione
1. Se il browser si chiude, il PC si blocca o suona la campanella, riapri il Secchione come al solito.
2. Compare **PARTITA NON CONCLUSA TROVATA**, con squadre, domanda e risposte registrate.
3. Premi **▶ RIPRENDI**: tornano squadre, punti, risposte e domanda corrente. Una domanda interrotta riparte **in pausa** con il tempo che restava. I tablet rientrano da soli. In alternativa scegli **NUOVA PARTITA** o **ESPORTA E ARCHIVIA**.

Il salvataggio è automatico, a ogni evento importante e ogni 5 secondi mentre il timer corre. È nel browser e, se il server è attivo, anche su disco in `data/sessions/`.

---

## Documentazione

| File | Per chi | Contenuto |
|---|---|---|
| [GUIDA_RAPIDA_DOCENTE.md](GUIDA_RAPIDA_DOCENTE.md) | docente | Una partita completa in 10 minuti |
| [NETWORK_SETUP.md](NETWORK_SETUP.md) | docente / tecnico | Installare Node.js, rete della scuola, hotspot, router dedicato, firewall |
| [PACK_STUDIO.md](PACK_STUDIO.md) | docente | Creare e modificare pacchetti con Pack Studio, senza scrivere file |
| [PACK_FORMAT.md](PACK_FORMAT.md) | chi crea contenuti | Formato dei pack, pacchetto `.zip`, Gestore Pacchetti, collisioni, migrazione |
| [EXPORT_CSV.md](EXPORT_CSV.md) | chi analizza i risultati | Contratto dei CSV, protezione dalle formule nei fogli di calcolo, dati grezzi |
| [TEST_CHECKLIST.md](TEST_CHECKLIST.md) | chi prova il software | Test automatici e i 19 test manuali da fare prima di una lezione |
| [ARCHITECTURE.md](ARCHITECTURE.md) | sviluppatore | Moduli, protocollo, dati, sicurezza, scelte |
| [CHANGELOG_V3_7_3.md](CHANGELOG_V3_7_3.md) | tutti | Importa contenuti con riconoscimento del file e backup; classifica finale rivelata dall'ultimo al primo |
| [CHANGELOG_V3_7_0.md](CHANGELOG_V3_7_0.md) | tutti | Session Planner: scaletta della puntata, regia "one screen" con azione principale |
| [CHANGELOG_V3_6_1.md](CHANGELOG_V3_6_1.md) | tutti | Classroom Flow: 60 s scrittura, regia rapida, mini-classifica, astensioni, Staffetta |
| [CHANGELOG_V3_6_0.md](CHANGELOG_V3_6_0.md) | tutti | Classroom Control: modifica in partita, annulla/ripeti, connessioni, ricerca |
| [CHANGELOG_v3.5.3_PACK_STUDIO.md](CHANGELOG_v3.5.3_PACK_STUDIO.md) | tutti | Novità della v3.5.3: Pack Studio, CSV protetti, test |
| [CHANGELOG_V3_5.md](CHANGELOG_V3_5.md) | tutti | Cosa è implementato, testato, parziale, non implementato |
| [CURRENT_STATE.md](CURRENT_STATE.md) | sviluppatore | Audit della v3 da cui si è partiti |
| [ASSET_AUDIT.md](ASSET_AUDIT.md) | prima di distribuire | Immagini e suoni: hash, duplicati, origine, licenza |

## Struttura

```text
index.html            regia del docente (funziona anche da file://)
studio.html           Pack Studio, editor dei pacchetti (solo dal PC del docente) → /studio
IMPORTA_PACCHETTO.bat trascina qui uno .zip per installare un pacchetto
player.html           pulsantiera per tablet          → /player
show.html             palco remoto (sola lettura)     → /show
network-test.html     verifica rete                   → /network-test
js/engine/            motore neutro: scoring, timer, sessione, pack, report (browser + Node)
js/engine/packlib.js  Gestore Pacchetti: importazione, collisioni, copie, export, sessioni miste, salvataggio dallo Studio
js/engine/packstudio.js modello di Pack Studio: bozza, domande, manche, immagini piatte, validazione, ZIP
js/engine/sessionPlan.js scaletta della puntata: riferimenti ai contenuti, ordine, mancanti, esecuzione con AVANTI
js/studio/            interfaccia di Pack Studio e bozze automatiche
js/lib/zip.js         lettura/scrittura .zip senza dipendenze
js/host/              regia: salvataggi, rete, finestra pulsantiere, schermata Pacchetti, finestra Scaletta
js/app.js             regia (palco, giochi, editor derivati dalla v3)
server/               server locale Node senza dipendenze (HTTP + WebSocket)
packs/arte_romana/    libreria pacchetti: una cartella per pack (pack.json, questions.json, games.json, images/)
packs/packs.bundle.js generato da tools/build_packs.js (serve per file://)
PACK_TEMPLATE/        pack di esempio da copiare
PACK_ESEMPI/          due pacchetti .zip pronti da importare (Vulcani, Inglese di base)
legacy_v3/            domande e giochi esportati dalla v3 (importabili)
tools/                conversione v3 → pack, build pack, simulazione multiplayer, audit asset
tests/                test automatici
data/                 salvataggi del server (creata all'avvio, non va distribuita)
```

## Test automatici

Non serve `npm install`: nessuna dipendenza esterna.

```bash
node tests/run.js
```

```bash
node tools/simulate_players.js
```

Il primo esegue 225 test su scoring, timer, risposte, persistenza, pack, Gestore Pacchetti, Pack Studio, answer matcher, Classroom Control/Flow, scaletta e regia "one screen", importa contenuti, classifica finale, zip, report e CSV, QR, server e mascotte. Il secondo simula 2, 6, 15 e 30 pulsantiere.

Runtime supportato: il **Node 24 portable incluso** in `runtime/`; con questo passano tutti i 225 test. Solo per informazione: con Node 8.16 ne passano 128; i 2 di `pilot_hotfix.test.js` usano API di Node 10 o successivo e falliscono allo stesso modo sulla v3.5.2.

## Requisiti
- **Regia**: Chrome o Edge recenti su Windows (Firefox e Safari recenti dovrebbero funzionare, ma non sono stati provati).
- **Pulsantiere**: qualsiasi browser di tablet, Chromebook o smartphone (il codice è scritto in ES5 per i dispositivi vecchi).
- **Server per i tablet**: il Node 24 portable incluso in `runtime/` (runtime supportato; nessuna installazione). Non serve per la modalità manuale.


## v3.7.2 — Reveal risultati
Dopo RIVELA, AVANTI apre una pagina risultati full-screen con tempi misurati e reveal dall’ultimo al primo. Se una vecchia versione del server è ancora aperta, la nuova build usa una porta successiva invece di riaprire la vecchia interfaccia.
