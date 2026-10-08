# Pack Studio — creare e modificare i pacchetti senza scrivere file

Pack Studio è l'editor dei pacchetti del Secchione. Si usano solo moduli e pulsanti: niente JSON, niente cartelle da preparare a mano.
Funziona senza Internet, sul PC del docente.

## Come si apre

- Dalla regia: **📦 PACCHETTI → ✏ PACK STUDIO** (pacchetto nuovo), oppure **MODIFICA** sulla riga di un pacchetto.
- Oppure apri direttamente `studio.html` dalla cartella del programma (con il server attivo l'indirizzo è `http://localhost:8765/studio`).

Pack Studio si apre **solo dal PC del docente**: contiene domande e soluzioni, quindi i tablet non possono raggiungerlo.

**Dove vengono salvati i pacchetti**

| Come hai avviato il Secchione | Dove finisce il pacchetto salvato |
|---|---|
| `AVVIA_IL_SECCHIONE.bat` (con server) | nella cartella `packs/` del programma, come quelli importati |
| `AVVIA_SENZA_TABLET.bat` o `index.html` (senza server) | nell'archivio di **questo browser** su questo PC |

Senza server i pacchetti del programma (ad esempio Arte romana) si possono usare ma non modificare: per modificarli avvia con `AVVIA_IL_SECCHIONE.bat`.

## La schermata iniziale

- **Nuovo pacchetto**: scrivi titolo, materia, classe e autore e premi **CREA IL PACCHETTO**. Si apre subito la prima domanda.
- **Bozze in corso**: i lavori non ancora salvati nella libreria. **RIPRENDI** riapre la bozza dal punto in cui l'avevi lasciata.
- **Apri un file .zip**: un pacchetto ricevuto da un collega o esportato in precedenza, anche le vecchie edizioni v3. Puoi anche trascinare il file nella pagina.
- **Modifica un pacchetto della libreria**: **MODIFICA** apre il pacchetto installato.

## Le cinque schede

### Informazioni
Titolo, sottotitolo, materia, classe (con una dicitura libera facoltativa, ad esempio "2ª media"), autore, versione, codice, descrizione e licenza.
Sotto **Aspetto** puoi scegliere l'immagine della schermata iniziale e i due colori del pacchetto.

- Il **codice** identifica il pacchetto nella libreria. In un pacchetto nuovo si compila da solo dal titolo. Se lo cambi in un pacchetto già esistente, viene salvato come **pacchetto nuovo** e l'originale resta com'era.
- La **versione** aumenta da sola quando aggiorni un pacchetto della libreria, ad esempio da 1.0.0 a 1.0.1. Con **+ AUMENTA** la alzi a mano.

### Domande
A sinistra c'è l'elenco, con la casella **Cerca**. Le domande da correggere hanno un punto esclamativo rosso. A destra si modifica la domanda selezionata:

- **Testo della domanda**: fino a 500 caratteri.
- **Le quattro alternative**: il pallino accanto alla lettera indica la **risposta corretta**. Le alternative devono essere tutte diverse.
- **Spiegazione**: compare in classe insieme alla soluzione.
- **Difficoltà** da 1 a 5, **Tempo per rispondere** da 5 a 600 secondi e **Stato**. Solo le domande *Approvate* vanno in gara; *Bozza* e *Da rivedere* restano nel pacchetto ma non vengono giocate.
- **Categoria** (compare sopra la domanda), **Argomento** e **Tag** (parole chiave separate da virgole, massimo 10). Servono anche per i report.
- **Immagine**: scegli un'immagine già presente nel pacchetto, oppure **⬆ CARICA DAL PC** o trascinala sul riquadro. **TOGLI** toglie l'immagine dalla domanda senza eliminarla dal pacchetto.

Pulsanti: **＋ NUOVA DOMANDA** (copia categoria, argomento, tempo e difficoltà dalla domanda corrente), **DUPLICA**, **ELIMINA** (chiede conferma), **↑ ↓** per cambiare l'ordine.

**ANTEPRIMA** mostra la domanda come sullo schermo della classe; **SOLUZIONE** evidenzia la risposta corretta e mostra la spiegazione. In gara l'ordine delle alternative viene mescolato.

### Crea da zero (RC2-A.3, Fase B1)
Sotto le schede c'è sempre la barra **CREA DA ZERO**: **＋ DOMANDA**, **＋ PHOTOPUZZLE**, **＋ INDOVINA**, **＋ ABBINAMENTO**, **＋ PAROLA SEGRETA**, **＋ STAFFETTA**. Ogni pulsante crea un contenuto vuoto e apre il suo modulo; i controlli in alto dicono cosa manca. Lo Studio si apre anche dalla regia, scheda **GIOCHI** → **✏ CREA NUOVI GIOCHI (PACK STUDIO)**.

### Manche speciali
Sono i giochi già presenti nel Secchione. Ogni tipo ha il suo **＋ AGGIUNGI**, e ogni manche si può **duplicare**, **eliminare** e **spostare**.
Ogni manche ha anche un'**Istruzione sulla tendina** facoltativa (massimo 160 caratteri), che compare sul proiettore prima che il gioco parta.

| Gioco | Cosa serve |
|---|---|
| Photopuzzle | un'immagine e la soluzione |
| Indovina | da 2 a 8 alternative (il pallino indica la soluzione) e da 1 a 5 indizi, dal più difficile al più facile |
| Abbinamenti | **1 · Immagini**: carica le 4 immagini (dal PC o dalla scheda Immagini). **2 · Voci**: scrivi i 4 nomi A–D nell'ordine che preferisci. **3 · Coppie**: per ogni immagine scegli la voce corretta; il riepilogo mostra le coppie e il controllo segnala una voce usata due volte o non abbinata. Nel pacchetto resta il formato di sempre (il termine *n* corrisponde all'immagine *n*); in gara le lettere vengono mescolate |
| Parola Segreta | la parola finale e 5 coppie: a sinistra la parola collegata, a destra quella che non c'entra |
| Staffetta di parole | da 1 a 20 collegamenti tra parole; si possono scrivere anche tutti in una riga: `NEVE \| SORGENTE \| FIUME \| MARE` |

**Risposte alternative accettate** (Photopuzzle, Indovina, Parola Segreta e ogni collegamento della Staffetta): sotto la risposta principale, **＋ AGGIUNGI RISPOSTA ALTERNATIVA** per un nome completo, una grafia o un titolo alternativo; **↑** riordina, **✕** elimina. Maiuscole, accenti, articolo iniziale e piccoli errori di battitura sono già tollerati senza scriverli. Alternative vuote o uguali, anche alla principale, vengono ignorate al salvataggio, con un avviso nel Controllo.

Per ogni manche si indicano anche un titolo, un tema facoltativo e la durata in secondi, da 10 a 300. L'anteprima è una versione semplificata dello schermo della classe.

### Immagini
- **⬆ AGGIUNGI IMMAGINI**: JPG, PNG, WEBP o GIF, anche più file insieme o trascinandoli nella pagina.
- Con **riduci le foto molto grandi** (attiva di serie), le foto oltre i 1920 pixel vengono ridotte per alleggerire il pacchetto.
- Ogni immagine riporta peso e **dove è usata**. Per **rinominarla** modifica il nome e premi Invio: domande e manche che la usano vengono aggiornate da sole.
- **ELIMINA** chiede conferma e avvisa se l'immagine è in uso.

Le immagini vengono salvate tutte **direttamente nella cartella `images/`** del pacchetto, con nomi semplici (minuscole, senza spazi né accenti), perché così si vedono anche sulle pulsantiere collegate in rete. Se apri un pacchetto con immagini dentro sottocartelle, Pack Studio le sposta da solo in `images/` e aggiorna i riferimenti.

### Controllo e salvataggio
Pack Studio controlla il pacchetto con le stesse regole del Gestore Pacchetti:

- **Da correggere**: problemi che impediscono il salvataggio. Fai clic su un problema per andare alla domanda o alla manche da sistemare.
- **Avvisi**: non bloccano il salvataggio. Esempi: domanda senza spiegazione, immagine non usata, materia non indicata.

Il numero sulla scheda indica quanti problemi restano. Quando compare ✓, il pacchetto è pronto.

## Salvare, esportare, riaprire

- **💾 SALVA NELLA LIBRERIA**: il pacchetto compare subito nella regia, in **📦 PACCHETTI**. Se la regia è aperta, l'elenco si aggiorna da solo.
  - Aggiornando un pacchetto esistente, Pack Studio chiede conferma e mostra la nuova versione.
  - Con il server, la versione precedente resta recuperabile in `data/cestino_pacchetti/`.
  - Nel browser la versione precedente viene sostituita: se vuoi conservarla, esportala prima come ZIP.
  - Se esiste già un altro pacchetto con lo stesso codice, puoi sostituirlo oppure salvare il tuo come pacchetto nuovo.
- **Pacchetto in gara**: se modifichi il pacchetto che si sta giocando, la partita non viene toccata. Quando vuoi usare la nuova versione, nella regia apri **📦 PACCHETTI** e premi **ATTIVA**: squadre e punti restano.
- **⬇ ESPORTA ZIP**: crea il file `.zip` del pacchetto, con domande, manche e immagini. Si reimporta dal Gestore Pacchetti, anche su un altro PC, oppure si riapre in Pack Studio con **Apri un file .zip**.
- **Bozze**: mentre lavori, tutto viene salvato automaticamente in questo browser; l'intestazione mostra l'ora dell'ultima bozza. Se chiudi la pagina o il PC si spegne, alla riapertura trovi il lavoro in **Bozze in corso**. Una bozza salvata nella libreria sparisce dall'elenco.

### Una sola copia: quella nella libreria
Dopo **SALVA**, il pacchetto nella libreria è l'unica copia che conta:

- il gioco usa quello;
- **ESPORTA** e **MODIFICA** leggono quello, anche dopo aver chiuso e riaperto il programma;
- le bozze servono solo a non perdere il lavoro non ancora salvato e il gioco non le usa mai.

Se avevi modificato domande o giochi dall'**ARCHIVIO** o dall'editor dei giochi della regia, quelle modifiche restano in questo browser e non sono nel pacchetto. Pack Studio, quando apri il pacchetto, le include e te lo segnala: salvando entrano nel pacchetto e la regia smette di tenerle a parte.

La **copia di sicurezza** che resta in `data/cestino_pacchetti/` (con il server) è solo una riserva: non compare nella libreria e non cambia il pacchetto in uso. Se servisse recuperarla, a programma chiuso si copia quella cartella in `packs/` al posto di quella attuale, rinominandola con il codice del pacchetto.

## Cosa Pack Studio non fa (di proposito)
Niente intelligenza artificiale, cloud, account, marketplace, gestione delle classi o tornei. I pacchetti restano sul tuo PC e si condividono come file `.zip`.

## Problemi comuni

| Problema | Cosa fare |
|---|---|
| **MODIFICA** è grigio su Arte romana | Senza server i pacchetti del programma sono in sola lettura: avvia con `AVVIA_IL_SECCHIONE.bat` |
| Il pulsante PACK STUDIO non apre nulla | Il browser ha bloccato la finestra: consenti le finestre pop-up, oppure apri `studio.html` dalla cartella |
| "Esiste già un pacchetto con questo codice" | Scegli se sostituirlo o salvare come nuovo; se il pacchetto è di un collega, salvalo come nuovo |
| Un'immagine non viene accettata | Deve essere JPG, PNG, WEBP o GIF, al massimo 15 MB |
| Ho modificato il pacchetto ma in gara vedo ancora la versione vecchia | In **📦 PACCHETTI** premi **ATTIVA** sul pacchetto |
