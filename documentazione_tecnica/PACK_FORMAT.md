# PACK_FORMAT — formato dei pack di contenuti (versione 1)

Un **pack** contiene le domande e i giochi di un argomento (es. *Arte romana*, *Vulcani*, *Romanticismo*). Il motore del Secchione è neutro: tutto ciò che riguarda una materia sta nel pack.

Questo documento è pensato anche per chi non programma. Per partire basta copiare la cartella **`PACK_TEMPLATE/`**.

> **Come si installa un pack.** Si mette tutto in un unico file **`.zip`** (vedi §1) e si importa con **un solo gesto**:
> - nella regia: **📦 PACCHETTI → IMPORTA PACCHETTO**, oppure trascinando lo `.zip` sulla finestra;
> - senza aprire la regia: trascinando lo `.zip` su **`IMPORTA_PACCHETTO.bat`**;
> - da terminale:
>
>   ```bash
>   node tools/pack_manager.js import vulcani.zip
>   ```
>
> Domande, giochi e immagini vengono controllati e copiati insieme. Non serve importare a parte `questions.json` e `games.json`, né copiare file a mano. Due pack pronti da provare sono in **`PACK_ESEMPI/`**. Il funzionamento della libreria è al §9.

---

## 1. Struttura

```text
packs/
  vulcani/                 ← il nome della cartella è l'id del pack
    pack.json              ← descrizione del pack (obbligatorio)
    questions.json         ← domande (obbligatorio)
    games.json             ← giochi arcade (facoltativo)
    images/                ← immagini (facoltativo)
      etna.jpg
```

Regole per i nomi:
- **id e nome della cartella**: da 2 a 40 caratteri, solo lettere minuscole, numeri, `_` e `-` (es. `arte_romana`, `vulcani-2b`);
- **immagini**: nomi semplici, senza spazi né lettere accentate (es. `pont_du_gard.jpg`). Formati **JPG, PNG, WEBP o GIF**, idealmente larghi 1200–1600 px e al massimo 15 MB ciascuna. L'SVG **non** è ammesso nei pacchetti importati, perché può contenere codice: va convertito in PNG.
- **immagini direttamente in `images/`**, senza sottocartelle (`images/etna.jpg`, non `images/sicilia/etna.jpg`). In rete il Secchione pubblica solo `images/<nome>`, quindi un'immagine in una sottocartella si vedrebbe in regia ma non sui dispositivi collegati. Un pacchetto con sottocartelle si importa comunque, con un avviso; Pack Studio sposta da solo quelle immagini in `images/` e non salva mai sottocartelle.

### Il pacchetto `.zip`
Lo `.zip` contiene gli stessi file. Possono stare alla radice dello zip oppure dentro **una** cartella:

```text
vulcani.zip
  vulcani/pack.json
  vulcani/questions.json
  vulcani/games.json        (facoltativo)
  vulcani/images/etna.png   (facoltativo)
```

Va bene lo zip creato da Windows (tasto destro sulla cartella → *Invia a* → *Cartella compressa*), oppure:

```bash
node tools/pack_manager.js zip PACK_ESEMPI/vulcani
```

Il secondo modo controlla la cartella prima di creare lo zip. Uno `.zip` può contenere **un solo** pacchetto. Vengono ignorati i file di sistema (`__MACOSX`, `Thumbs.db`, `desktop.ini`, `.DS_Store`) e i file in `images/` che non sono immagini.

I file JSON si possono scrivere con qualsiasi editor di testo (Blocco note, Visual Studio Code…). Salva in **UTF-8**. Più semplice: **Pack Studio** ([PACK_STUDIO.md](PACK_STUDIO.md)) crea e modifica i pacchetti con moduli e pulsanti, senza scrivere JSON.

---

## 2. `pack.json`

| Campo | Obbligatorio | Esempio | Note |
|---|---|---|---|
| `format` | **sì** | `"secchione-pack"` | sempre questo valore |
| `formatVersion` | **sì** | `1` | sempre 1 per questa versione |
| `id` | **sì** | `"vulcani"` | uguale al nome della cartella |
| `title` | **sì** | `"Vulcani"` | max 60 caratteri, compare sul palco |
| `version` | **sì** | `"1.0.0"` | aumentala quando modifichi il pack |
| `subtitle` | no | `"Fuoco dalla Terra"` | |
| `subject` | no | `"Scienze"` | materia; usata come predefinito per le domande |
| `grade` | no | `2` | anno di corso consigliato (1–13) |
| `gradeLabel` | no | `"Secondaria di primo grado · 2ª"` | testo libero |
| `author` | no | `"Mario Rossi"` | |
| `description` | no | | descrizione per i colleghi |
| `language` | no | `"it"` | |
| `license` | no | `"CC BY-SA 4.0"` | licenza dei contenuti, se nota |
| `files` | no | `{"questions":"questions.json","games":"games.json","images":"images/"}` | per nomi di file diversi |
| `theme.accent`, `theme.accent2` | no | `"#f5bd63"` | colori in formato `#rrggbb` |
| `theme.homeImage` | no | `"etna.jpg"` | sfondo della schermata iniziale |
| `theme.tags` | no | `["Vulcani","Terremoti"]` | max 6 |
| `texts.homeEyebrow` | no | `"IL GAME SHOW DI SCIENZE"` | testi della schermata iniziale |
| `texts.homeClaim` | no | `"Osserva. Ragiona."` | `\n` va a capo |
| `texts.mascotHome` | no | `"Pronti?"` | fumetto della mascotte |
| `texts.footer` | no | `"VULCANI · TERREMOTI"` | |
| `gameNames` | no | `{"chain":"Catena di parole"}` | nomi visibili dei giochi (vedi §5) |
| `legacy` | no | `{"v3PackKey":"romana","imagePrefix":"romana/"}` | solo per i pack convertiti dalla v3 |

---

## 3. `questions.json`

Un elenco (array) di domande. Oggi la regia gioca le domande a **scelta multipla** (`"mcq"`): 4 alternative, una corretta. Sul palco le alternative vengono **mescolate**, quindi la lettera A–D cambia ogni volta.

| Campo | Obbligatorio | Esempio | Note |
|---|---|---|---|
| `id` | **sì** | `"vul-001"` | unico nel pack e **stabile nel tempo**: serve a confrontare i risultati tra sessioni. Va bene anche un UUID. |
| `question` | **sì** | `"Qual è il vulcano attivo più alto d'Europa?"` | max 500 caratteri |
| `options` | **sì** | `["Etna","Vesuvio","Stromboli","Teide"]` | **esattamente 4**, tutte diverse, max 200 caratteri |
| `correct` | **sì** | `"A"` | lettera dell'alternativa corretta **nell'ordine scritto qui** |
| `type` | no | `"mcq"` | predefinito `mcq` |
| `seconds` | no | `30` | durata reale del timer, da 5 a 600 (predefinito 30) |
| `category` | no | `"Vulcani europei"` | usata nel report "Risultati per categoria" |
| `topic` | no | `"Vulcani"` | argomento |
| `subject` | no | `"Scienze"` | materia (predefinita: quella del pack) |
| `grade` | no | `2` | anno di corso |
| `difficulty` | no | `2` | da 1 a 5 |
| `explanation` | no | `"L'Etna supera i 3300 m."` | mostrata al reveal, max 1000 caratteri |
| `image` | no | `"etna.jpg"` | file nella cartella `images/` |
| `media` | no | `[{"type":"image","src":"etna.jpg","caption":"..."}]` | predisposto per il futuro; oggi si usa la prima immagine |
| `author` | no | `"Mario Rossi"` | |
| `tags` | no | `["vulcani","ripasso"]` | parole chiave, al massimo 10, di 30 caratteri ciascuna (controllate da Pack Studio) |
| `status` | no | `"approved"` | `approved` = in gara; `draft` o `review` = **esclusa dalla gara** |

Campi in più, come `sourcePage` o `sourceLabel` usati dal pack Arte romana, vengono conservati e mostrati quando previsti.

Tipi **previsti ma non ancora giocabili** dalla regia: `truefalse`, `numeric`, `text`, `buzzer`. La pulsantiera e il server li sanno già gestire, ma una domanda di questo tipo oggi viene rifiutata con un messaggio chiaro.

> **Il valore in punti non si scrive nella domanda.** Dipende dal profilo di punteggio scelto in regia (Show, Didattico, Classico v3). Il vecchio campo `points` della v3 viene ignorato.

---

## 4. `games.json`

```json
{ "games": { "photopuzzle": [ ... ], "indovina": [ ... ], "abbinamenti": [ ... ], "ghigliottina": [ ... ], "chain": [ ... ] } }
```

Ogni manche ha `label` (titolo in regia, max 80), `theme` (visibile sul palco: non deve svelare la soluzione, max 70) e `seconds` facoltativo (10–300). Per compatibilità i vecchi pack con 30 s restano validi; dalla v3.6.1 i giochi che richiedono risposta scritta usano **almeno 60 secondi** e Pack Studio propone 60 s per le nuove manche. Ogni gioco può avere al massimo 200 manche.

| Gioco (id interno) | Campi specifici | Regole |
|---|---|---|
| `photopuzzle` | `image`, `answer` | 30 tessere tolte nel tempo della manche |
| `indovina` | `subject`, `candidates`, `clues` | 2–8 alternative tutte diverse, **compresa** la soluzione; 1–5 indizi (max 180 caratteri) |
| `abbinamenti` | `cards` (4 × `{img,title}`), `names` (4 termini) | il termine *n* corrisponde all'immagine *n* |
| `ghigliottina` | `answer`, `pairs` | esattamente 5 coppie `["parola che resta","alternativa"]` |
| `chain` | `links` | 1–20 coppie `{"from":"…","to":"…"}`, parole diverse |

---

## 5. Nomi dei giochi

Gli **id interni** restano quelli della v3 per compatibilità dei dati. I **nomi visibili** predefiniti della v3.5 sono neutri:

| id interno | nome v3 | nome v3.5 predefinito |
|---|---|---|
| `photopuzzle` | Photopuzzle | Photopuzzle |
| `indovina` | Indovina | Indovina |
| `abbinamenti` | Abbinamenti | Abbinamenti |
| `ghigliottina` | Ghigliottina | **Parola Segreta** |
| `chain` | Catena di parole | **Staffetta di parole** |

Un pack può cambiarli con `gameNames`.

---

## 6. Validazione

Il pack viene controllato:
- **all'avvio del server** (`AVVIA_IL_SECCHIONE.bat`): se un JSON è cambiato, il server ricostruisce `packs/packs.bundle.js` e nella finestra nera indica file e domanda da correggere;
- **a mano**:

  ```bash
  node tools/build_packs.js --check
  ```

- **a ogni importazione** (regia, `IMPORTA_PACCHETTO.bat`, `tools/pack_manager.js`), con i controlli aggiuntivi del §9.2.

Un pack con errori **non viene caricato**: gli altri continuano a funzionare. Esempi di messaggi:
`domanda 3: servono esattamente 4 alternative` · `domanda 7: "correct" deve essere A, B, C o D` · `ghigliottina manche 2: Servono esattamente 5 coppie.`

### Pack in un solo file `.json`
Si può importare anche un unico `.json` con `"format": "secchione-pack"` e i campi `questions` e `games` dentro, per esempio uno creato con:

```bash
node tools/build_packs.js --export vulcani
```

Le immagini incorporate come `data:image/...;base64,` vengono estratte e salvate come file. Per condividere un pack **con le immagini** è però più semplice usare lo `.zip` (PACCHETTI → ESPORTA).

---

## 7. Compatibilità con la v3

| File v3 | Come si usa in v3.5 |
|---|---|
| `domande_romana.json` (archivio domande esportato) | ARCHIVIO → **IMPORTA**: accettato, prefissi `romana/` delle immagini convertiti |
| `giochi_romana.json` / export giochi v3 | GIOCHI → **IMPORTA GIOCHI** |
| **Lo ZIP di un'intera edizione v3** (es. `Il_Secchione_PREISTORIA_v3.0.zip`) | **PACCHETTI → IMPORTA PACCHETTO**: viene riconosciuto e convertito da solo, con domande, 5 giochi e immagini. La materia viene impostata su "Arte e immagine" e conviene verificarla. |
| Personalizzazioni salvate nel browser dalla v3 | importate automaticamente al primo avvio da `file://` |

Il programma legge i dati dell'edizione v3 (`js/packs.js`) **senza eseguire** il codice contenuto nello zip. Per convertire una cartella già estratta resta disponibile:

```bash
node tools/convert_v3_pack.js ..\Il_Secchione_PREISTORIA_v3.0 preistoria --grade 1
```

---

## 8. Esempio completo minimo

`packs/vulcani/pack.json`
```json
{
  "format": "secchione-pack",
  "formatVersion": 1,
  "id": "vulcani",
  "title": "Vulcani",
  "subtitle": "Fuoco dalla Terra",
  "subject": "Scienze",
  "grade": 2,
  "author": "Mario Rossi",
  "version": "1.0.0",
  "theme": { "accent": "#ff7a45", "accent2": "#ffd258", "homeImage": "etna.jpg", "tags": ["Vulcani", "Terremoti"] }
}
```

`packs/vulcani/questions.json`
```json
[
  {
    "id": "vul-001",
    "category": "Vulcani europei",
    "difficulty": 1,
    "question": "Qual è il vulcano attivo più alto d’Europa?",
    "options": ["Etna", "Vesuvio", "Stromboli", "Teide"],
    "correct": "A",
    "explanation": "L’Etna supera i 3300 metri.",
    "seconds": 30,
    "image": "etna.jpg"
  }
]
```

`packs/vulcani/games.json`
```json
{
  "games": {
    "chain": [
      { "label": "Dal magma alla roccia", "theme": "Rocce", "links": [ { "from": "MAGMA", "to": "LAVA" }, { "from": "LAVA", "to": "BASALTO" } ] }
    ]
  }
}
```

Un esempio più ricco, con bozze e tre giochi, è in **`PACK_TEMPLATE/`**.

---

## 9. Gestore Pacchetti (libreria locale)

### 9.1 Dove vivono i pacchetti
| Avvio | Libreria | Note |
|---|---|---|
| `AVVIA_IL_SECCHIONE.bat` (server locale) | cartella **`packs/`** del programma | Ogni pack è una cartella `packs/<id>/` con `install.json` (origine, data, impronta del contenuto). Vale per tutti i browser e per i tablet. |
| `AVVIA_SENZA_TABLET.bat` / `index.html` (senza server) | pack del programma (**sola lettura**) + **pack salvati nel browser** (IndexedDB) | I pack importati senza server restano in quel browser. Per portarli nella cartella `packs/`: ESPORTA lo `.zip` e reimportalo con il server attivo. |

Tutto funziona **offline**: nessun account, nessun cloud, nessun negozio online.

### 9.2 Controlli all'importazione
Un pacchetto viene installato **solo se è completamente valido**: in caso di errore non viene scritto nulla.
- tutti i controlli del §6 (struttura, domande, giochi);
- ogni immagine citata da domande, giochi o home deve esistere in `images/` (messaggio: `immagine mancante: "etna.png" (usata in domanda 1)`);
- i file immagine devono essere davvero JPG, PNG, WEBP o GIF (controllo dei primi byte), SVG escluso;
- i percorsi pericolosi nello zip (`../`, percorsi assoluti) fanno rifiutare l'intero file;
- limiti: archivio fino a 300 MB, 3000 file, 2000 immagini, 15 MB per immagine.

Gli avvisi non bloccano l'importazione: immagini non usate, nomi con spazi, bozze escluse dalla gara.

### 9.3 Collisioni
| Situazione | Comportamento |
|---|---|
| Lo stesso pacchetto (stesse domande, giochi e immagini) importato di nuovo | **"già installato"**, nessuna modifica |
| Un pacchetto **diverso** con un `id` già presente | installato con un **nuovo id** (`vulcani-2`, `vulcani-3`…) e titolo "(2)": **quello esistente non viene mai sovrascritto** |
| Due pack con gli stessi id di domanda (es. entrambi `q001`) | nessun problema: in gara ogni domanda è identificata come **`packId/id`** (`vulcani/q001`, `inglese_base/q001`) |
| Due pack con immagini dallo stesso nome | nessun problema: ogni immagine si cerca nel pack da cui proviene la domanda o la manche |

Per **aggiornare** un pack a una nuova versione: importa la nuova versione (riceverà un id nuovo), verificala, poi ELIMINA la vecchia. Oppure modificalo con **Pack Studio**, che lo aggiorna sul posto dopo una conferma esplicita (§9.7).

### 9.4 Azioni della schermata PACCHETTI
| Azione | Effetto |
|---|---|
| **ATTIVA** | quel pack diventa l'unico in gara. **Squadre, punti e partita restano**; si riparte dalla prima domanda del nuovo pack. Non serve riavviare. |
| ☑ + **USA I SELEZIONATI** | **sessione mista** con più pack: domande in sequenza (o mescolate, se si spunta *mescola le domande*) e giochi di tutti i pack, con il nome del pack accanto a ogni manche |
| **DUPLICA** | copia indipendente e modificabile (`<id>-copia`, titolo "(copia)"), che ricorda il pack di partenza (`derivedFrom`) |
| **ESPORTA** | crea lo `.zip` completo (`<id>_v<versione>.zip`) da condividere o reimportare; reimportandolo risulta "già installato" |
| **ELIMINA** | con il server: spostato in `data/cestino_pacchetti/`, quindi recuperabile; senza server: eliminato dal browser. L'ultimo pack rimasto e il pack in gara non si possono eliminare. |

Le modifiche alle domande (ARCHIVIO) e ai giochi si fanno con **un solo pack attivo**: in una sessione mista sono disattivate. Per adattare un pack di un collega, conviene DUPLICARLO e modificare la copia.

### 9.5 Provenienza dei dati (sessioni e risposte)
Pack e classe sono concetti separati: cambiare pack non tocca le squadre. Ogni dato conserva il pack da cui proviene:
- **sessione**: `packs` (elenco dei pack usati con `packId`, `packVersion`, `title`, `subject`, `grade`, `topics`, date di attivazione) e `activePacks` (pack in gara);
- **ogni risposta** (`responses[]`) e ogni round: `packId`, `packVersion`, `subject` (materia), `topic` (argomento), `sourceQuestionId` (id originale della domanda nel pack);
- **CSV**: colonne `pack_id`, `pack_versione`, `materia`, `argomento`, `id_domanda` (in gara, es. `vulcani/q001`) e `id_domanda_originale` (`q001`);
- **report HTML**: tabella "Pacchetti usati" e, nelle sessioni miste, "Risultati per pacchetto".

Per confrontare la stessa domanda tra sessioni diverse si usa la coppia **`pack_id` + `id_domanda_originale`**.

### 9.6 Migrazione automatica
Avviene da sola, senza intervento del docente:
1. **Pack già presenti nella cartella** (come Arte romana): al primo avvio del server vengono registrati nella libreria, con la creazione di `install.json`. Domande, giochi e immagini non vengono modificati.
2. **Pack importati con la prima v3.5** (vecchio pulsante "IMPORTA PACK", salvati nelle preferenze del browser): spostati nella libreria al primo avvio.
3. **Partite salvate con la prima v3.5**: alla ripresa, gli id domanda (`rom002`) diventano `arte_romana/rom002` e a ogni risposta vengono aggiunti pack, versione e id originale.
4. **Edizioni v3** (ZIP completi): convertite al momento dell'importazione (§7).
5. **Pack attivo**: l'ultima scelta (`packKey`) diventa la selezione dei pack in gara.

### 9.7 Salvataggio da Pack Studio
Pack Studio ([PACK_STUDIO.md](PACK_STUDIO.md)) scrive nella stessa libreria, ma con regole diverse dall'importazione, che resta non distruttiva:

| Modalità | Comportamento |
|---|---|
| **nuovo** (`mode: "new"`) | fallisce se esiste già un pack con quel codice: nessuna scrittura |
| **sostituisci** (`mode: "replace"`) | solo dopo la conferma del docente. Con il server il nuovo pack viene scritto a parte; la versione precedente va in `data/cestino_pacchetti/<id>_<data>_prima-della-modifica`, poi il nuovo prende il suo posto (in caso di errore si ripristina la precedente). Nel browser la sostituzione avviene in un'unica transazione, senza copia. |

- I pack del programma in sola lettura (senza server) non si sovrascrivono.
- Le immagini devono stare direttamente in `images/`: un pacchetto con sottocartelle viene rifiutato al salvataggio.
- Il codice nell'indirizzo deve coincidere con l'`id` del pacchetto.
- `install.json` registra `editedWith: "Pack Studio"`, `updatedAt` e `previousVersion`.
- Il pacchetto salvato è l'unica copia di lavoro: le eventuali copie personalizzate che la regia di quel browser teneva per lo stesso pacchetto (ARCHIVIO, editor dei giochi) vengono incluse all'apertura nello Studio ed eliminate dopo il salvataggio.
- La copia di sicurezza nel cestino non compare nella libreria e non cambia il pacchetto in uso.
- Se il contenuto è cambiato e la versione no, lo Studio propone la versione successiva (`1.0.0` → `1.0.1`).
- API del server (solo regia, `X-Secchione-Host`): `PUT /api/host/packs/<id>` (nuovo) e `PUT /api/host/packs/<id>?mode=replace`; il corpo è lo `.zip` del pacchetto.
- Lo `.zip` esportato da Pack Studio ha lo stesso formato dell'ESPORTA della schermata PACCHETTI.

### 9.8 Riga di comando
```text
node tools/pack_manager.js import <file.zip|file.json> [altri…]   importa (anche più file)
node tools/pack_manager.js list                                   elenco con materia, classe, versione, domande, giochi
node tools/pack_manager.js duplicate <id> [--id nuovo] [--title "Titolo"]
node tools/pack_manager.js export <id> [file.zip]
node tools/pack_manager.js remove <id>                            nel cestino data/cestino_pacchetti
node tools/pack_manager.js zip <cartella> [file.zip]              crea lo .zip da una cartella sorgente
node tools/pack_manager.js migrate                                registra i pack già presenti
```
