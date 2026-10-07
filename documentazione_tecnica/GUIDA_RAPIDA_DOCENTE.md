# Guida rapida per il docente

Obiettivo: giocare una partita completa dopo 10 minuti di spiegazione. Non servono competenze tecniche.

## 1. Prima della lezione (2 minuti)

| Hai i tablet? | Cosa fai |
|---|---|
| **No** | Doppio clic su **AVVIA_SENZA_TABLET.bat** |
| **Sì** | Doppio clic su **AVVIA_IL_SECCHIONE.bat**. Si apre una **finestra nera**: non chiuderla fino a fine lezione. |

Questa release include Node portable: estrai tutto lo ZIP prima di avviare. Non devi installare Node. Se manca runtime/node.exe, riestrai il pacchetto completo. I tablet usano la stessa rete locale del PC; Internet non è necessario. Vedi [NETWORK_SETUP.md](NETWORK_SETUP.md).

**Doppio schermo:** collega il proiettore in modalità *Estendi*, premi **APRI** (in basso, "DOPPIO SCHERMO") e trascina la finestra del palco sul proiettore. Premi **F11** per il tutto schermo. Sul PC resta la regia, sul proiettore solo il palco.

## 2. Squadre e regole (1 minuto)

1. Colonna sinistra: scrivi il nome di una squadra e premi **＋**. Ripeti per ogni squadra.
2. **⚙ IMPOSTAZIONI PARTITA** (facoltativo) per scegliere il punteggio:
   - **Show** (consigliato): corrette 300 / 275 / 250… in ordine di risposta, errata −100. Ogni squadra ha **3 astensioni gratuite per partita**; dalla 4ª l’astensione viene conteggiata ai fini del punteggio come risposta errata. Nei dati resta comunque registrata come omissione.
   - **Didattico**: 1 punto per risposta corretta, niente penalità.
   - **Classico v3**: mantiene la scala punti storica; anche qui la regola della partita concede le prime 3 astensioni gratuite e dalla 4ª applica la penalità dell’errore.

   Qui puoi anche scrivere la classe (es. 2B): comparirà nei report.
3. **REGOLE SULLO SCHERMO** mostra il regolamento sul proiettore.

## 3. Collegare i tablet (solo con le pulsantiere, 3 minuti)

1. Premi **📱 PULSANTIERE (TABLET)**: vedi QR code e **PIN**.
2. Ogni squadra inquadra il QR (o scrive l'indirizzo), inserisce il PIN e tocca il nome della propria squadra.
3. Sul PC compare "TABLET 3 · chiede 2B". Premi **✓ APPROVA TUTTE LE RICHIESTE**, oppure scegli la squadra dal menu accanto al tablet.
4. Quando tutti sono collegati, premi **🔒 CHIUDI INGRESSI**: nessun altro dispositivo potrà entrare, mentre i tablet già associati rientrano da soli anche dopo un refresh.

Il pallino accanto alla squadra (● verde / ○ rosso) indica se il suo tablet è collegato.

## 4. Giocare una domanda

```text
▶ AVVIA DOMANDA (Spazio)  →  la classe risponde  →  ● RIVELA  →  AVANTI/PROSSIMA mostra la CLASSIFICA DEL ROUND  →  AVANTI/PROSSIMA passa al contenuto seguente
```

**Regia "one screen" (v3.7.0)**: in alto a destra, sopra le schede, c'è sempre un solo **pulsante grande**, quello da premere adesso: AVVIA, poi RIVELA, poi PROSSIMA o AVANTI. Dalla **v3.7.2**, dopo il reveal il primo AVANTI/PROSSIMA apre la **classifica della singola domanda a tutto schermo**; il secondo passa davvero al contenuto seguente. Sotto ci sono solo i comandi utili in quel momento: **⏸ PAUSA**, **+10 s**, **■ CHIUDI TEMPO**, **✕ ANNULLA ROUND**, **↺ RIPETI**, **✎ MODIFICA**, **↶ ANNULLA ULTIMA**, **SALTA**. In alto vedi anche *✍ Risposte n / n*, *📱 n / n collegate* e, solo quando serve, **Ø gratis**: le astensioni gratuite rimaste alle squadre che ne hanno al massimo una.

- **⏸ PAUSA / ▶ RIPRENDI** (tasto `P`) e **+10 s** (tasto `+`) se serve tempo.
- La durata della domanda è quella scritta nella domanda (nell'archivio puoi cambiarla da 5 a 600 secondi).
- **Con i tablet** le risposte arrivano da sole nella griglia (`▣` = arrivata dal tablet, con il tempo misurato). A fine tempo le squadre col tablet che non hanno inviato risultano *omesse*. Se tutte le squadre hanno il tablet, i punti si confermano da soli al momento della soluzione.
- **Senza tablet**, dopo il tempo guarda le tavolette e registra:

| Tasto | Effetto |
|---|---|
| `A` `B` `C` `D` | risposta della squadra evidenziata, poi passa alla successiva |
| `0` (o `O`) | risposta omessa |
| `↑` `↓` | cambia squadra |
| `Canc` | cancella la risposta della squadra evidenziata |
| `Ctrl+Z` | annulla l'ultima operazione |
| `Invio` | conferma i punti (se il tempo corre, prima lo chiude) |
| `→` / `←` | domanda successiva / precedente |
| `R` | rivela la soluzione |
| `Spazio` | avvia la domanda / chiude il tempo |

Esempio: con 6 squadre premi `C B C 0 A C` e poi `Invio`. L'esito (✓ ✗ Ø) lo calcola il programma.

- **Ordine delle corrette**: conta l'ordine di registrazione (con i tablet, l'ordine di arrivo). Puoi spostare una squadra più in alto con **▲**.
- **Errore dopo la conferma?** Premi **↺ RIAPRI PUNTI**, correggi e conferma di nuovo.
- **Tablet che ha sbagliato a premere?** Il pulsante **↺** accanto alla risposta sblocca la squadra, che può rispondere di nuovo.
- **PROSSIMA DOMANDA** è ora il comando rapido: se il round è aperto lo chiude, segna automaticamente come Ø le squadre mancanti, registra i punti e passa oltre. Non serve più confermare i punti separatamente. Le prime tre Ø della singola squadra sono gratuite; dalla quarta valgono come errore ai fini del punteggio.

### Correggere al volo (v3.6.0)
- **✎ MODIFICA**, tra i comandi della regia in alto: apre la domanda senza passare dall'Archivio. La modifica viene salvata nel pacchetto.
  - **Prima di avviarla**: premi **Salva**. Resti sulla stessa domanda, con squadre e punti intatti, e quando la avvii vale la versione nuova.
  - **A domanda già avviata**: **Salva per le prossime volte** lascia il round com'era, con le risposte già arrivate. **Salva e riavvia domanda** annulla il round (nessun punto) e torna all'anteprima con la versione nuova.
- **✕ ANNULLA ROUND**: per una domanda lanciata per sbaglio o un problema tecnico. Scarta le risposte di quel round, non assegna punti e torna all'anteprima della stessa domanda.
- **↺ RIPETI**: dopo la soluzione riapre la domanda come round nuovo, senza le risposte precedenti. I punti già confermati restano.
- Sotto il timer della regia: **Domanda 7 / 30 · giocate 6 · da giocare 24** e lo stato delle pulsantiere, per esempio **📱 5 / 6 COLLEGATE · Disconnessa: 3B**. Una squadra disconnessa non perde né il posto né i punti.
- **ARCHIVIO**: casella **Cerca**, che guarda testo, risposte, spiegazione, argomento e tag, più i filtri per argomento e difficoltà. **Vai** apre quella domanda.

## 4 bis. La scaletta della puntata (v3.7.0)

Per preparare la lezione prima di entrare in classe:

1. **📋 SCALETTA** → **＋ NUOVA** e scrivi un nome, per esempio *Barocco 3B · verifica*.
2. Spunta i pacchetti, poi scegli **DOMANDE** o **GIOCHI**. Cerca o filtra per argomento e difficoltà, poi premi **＋** sugli elementi che vuoi.
3. Riordina trascinando (o con **↑ ↓**). **⧉** ripete un elemento più avanti, **✕** lo toglie, **🔀 MESCOLA SOLO LE DOMANDE** non sposta i giochi.
4. La scaletta si salva da sola: la ritrovi nell'elenco in alto. **ESPORTA** ne salva una copia in un file.

In classe: **▶ AVVIA SCALETTA**, poi solo **AVANTI**. Ogni AVANTI chiude, segna le mancanti come Ø, registra i punti e apre l'elemento successivo, domanda o gioco. In alto vedi *📋 nome · 3 / 9* e *Poi: …*.

- Sei andato in HOME o in CLASSIFICA? **▶ RIPRENDI SCALETTA** torna al punto giusto.
- Un contenuto eliminato dal pacchetto compare come **MANCANTE** (in rosso) e viene saltato: non viene mai sostituito con un altro.
- **✕** nel riquadro della scaletta la interrompe; squadre e punti restano.
- Il report di classe ha la sezione **Scaletta**, con l'esito di ogni elemento.

## 5. Giochi bonus

Scheda **GIOCHI** (o i pulsanti "GIOCHI BONUS"): Photopuzzle, Indovina, Abbinamenti, Parola Segreta, Staffetta di parole. Le manche che richiedono di **scrivere** hanno ora almeno **60 secondi**. Risposte e punti restano nella stessa regia del gioco: non vieni più spostato automaticamente alla scheda PUNTI. Le risposte mancanti possono essere trasformate in Ø e confermate direttamente lì. Dalla v3.7.0 i comandi del gioco sono nella regia in alto, come per le domande: **▶ AVVIA**, gli aiuti (+ INDIZIO, ELIMINA 2, + LETTERA, RIVELA 1, − 1 PEZZO), **⏸ PAUSA**, **+10 s**, **● RIVELA**; nella Parola Segreta **SCEGLI A / SCEGLI B** con i voti dei tablet. Nella scheda GIOCHI restano la scelta e la modifica della manche e RISPOSTE E PUNTI. Nella Staffetta le parole composte sono mascherate con uno spazio ben visibile tra le parole (es. `ARA PACIS`).

## 6. Cambiare argomento: i Pacchetti

- **📦 PACCHETTI** (colonna sinistra) mostra gli argomenti installati con materia, classe, versione, numero di domande e di giochi.
- **Aggiungere un argomento**: IMPORTA PACCHETTO e scegli lo `.zip` ricevuto da un collega, oppure trascinalo sulla finestra. Domande, giochi e immagini si installano insieme.
- **ATTIVA**: cambia argomento subito. Le squadre e i punti restano, quindi puoi fare 10 domande di storia e poi 10 di scienze nella stessa partita.
- **Più argomenti insieme**: spunta i pacchetti e premi USA I SELEZIONATI (con *mescola le domande* se vuoi).
- **DUPLICA** per avere una copia da modificare, **ESPORTA** per mandarlo a un collega, **ELIMINA** per toglierlo. Con il server finisce in un cestino recuperabile.
- Nei risultati (CSV e report) ogni risposta indica da quale pacchetto viene.

### Rimettere nel programma un file esportato (v3.7.3)
Non serve ricordare dove va: premi **📥 IMPORTA CONTENUTI**, oppure trascina il file sulla regia. Il programma riconosce che cosa contiene e te lo dice prima di cambiare qualcosa:

- *Hai selezionato un archivio domande (.json). Verranno sostituite le domande del pack attivo.*
- *Hai selezionato un archivio giochi (.json). Verranno sostituiti i giochi del pack attivo* (solo i tipi presenti nel file).
- *Hai selezionato un pacchetto completo (.zip). Verrà installato nella libreria pacchetti.*

Prima di sostituire domande o giochi scegli **⬇ ESPORTA BACKUP PRIMA DI CONTINUARE**: salva una copia di quelli attuali, poi importa. Domande e giochi importati restano anche chiudendo il programma.

### Creare o modificare un pacchetto: Pack Studio
- In **📦 PACCHETTI** premi **✏ PACK STUDIO** per un pacchetto nuovo, oppure **MODIFICA** su un pacchetto esistente.
- Scrivi le domande: testo, 4 alternative, il pallino sulla risposta corretta, spiegazione, tempo e, se vuoi, un'immagine. L'**ANTEPRIMA** mostra la domanda come in classe.
- Nella scheda **Manche speciali** aggiungi i giochi; nella scheda **Immagini** carichi le foto, anche trascinandole.
- In **Controllo e salvataggio** clicca sui problemi per correggerli, poi **💾 SALVA NELLA LIBRERIA**. La regia aggiorna l'elenco da sola. Se il pacchetto è in gara, premi **ATTIVA** per usare la nuova versione: squadre e punti restano.
- Il lavoro viene salvato automaticamente come bozza. Guida completa: [PACK_STUDIO.md](PACK_STUDIO.md).

## 7. Classifica e risultati

- **★ CLASSIFICA** la mostra sul proiettore, tutta subito.
- **A fine partita** (ultima domanda o fine della scaletta) arriva la **CLASSIFICA FINALE** come una proclamazione:
  1. prima la schermata *CLASSIFICA FINALE · Ecco il verdetto*;
  2. poi ogni **AVANTI** (o il tasto →) rivela una posizione, dall'ultima alla prima, mentre i posti non ancora svelati restano coperti;
  3. il pulsante dice che cosa rivela ("▶ RIVELA IL 4° POSTO"), e l'ultimo è **★ RIVELA IL 1° POSTO**.

  Hai tempo di commentare ogni posizione. **MOSTRA TUTTA LA CLASSIFICA** rivela tutto in una volta.
- Scheda **CLASSIFICA → ESPORTA RISULTATI**:
  - **REPORT DI CLASSE**: pagina stampabile con classifica, % corrette, categorie e domande con più errori;
  - **RISPOSTE CSV**: una riga per risposta, si apre con Excel;
  - **JSON COMPLETO**: copia di sicurezza della partita;
  - **LOG TECNICO**: da inviare a chi segue il pilot in caso di problemi.

## 8. Se qualcosa va storto

| Problema | Soluzione |
|---|---|
| Il browser si è chiuso / il PC si è bloccato / suona la campanella | Riapri il Secchione e premi **▶ RIPRENDI** |
| Un tablet perde la rete | Si ricollega da solo ("RICONNESSO COME 2B"); nel frattempo puoi registrare la sua risposta a mano |
| Un tablet ricarica la pagina | Rientra da solo nella sua squadra, senza PIN |
| I tablet non aprono la pagina | Rete della scuola chiusa: continua in **modalità manuale** (la griglia funziona sempre), poi vedi NETWORK_SETUP.md |
| La finestra nera è stata chiusa | Riavvia **AVVIA_IL_SECCHIONE.bat**, poi nella regia **▶ RIPRENDI**: PIN e tablet restano gli stessi |
| Windows chiede "Consenti accesso" al primo avvio | Scegli **Reti private** e consenti: serve ai tablet per raggiungere il PC |
| Un pacchetto non si importa | Leggi l'elenco degli errori nella finestra PACCHETTI (es. "immagine mancante"): il pacchetto non viene installato finché non è corretto, e gli altri non vengono toccati |

## Cosa la pulsantiera NON fa (di proposito)

Il tablet non mostra la domanda, che resta sul grande schermo, e non conosce la soluzione prima del reveal. Non chiede nomi, email o account. Una pagina web non può impedire allo studente di cambiare app: il tasto ⛶ mette il tablet a schermo intero e lo tiene acceso, ma la disciplina resta compito del docente.


## Pulsantiera nei giochi speciali (v3.5.1)
- **PhotoPuzzle, Indovina e Catena:** quando avvii la manche, i tablet passano automaticamente da A/B/C/D a una tastiera virtuale. La squadra compone la soluzione e preme **INVIA**. Dalla **v3.7.2** la risposta lunga resta in una barra compatta con contatore e scorrimento automatico: non spinge più i tasti o INVIA fuori schermo, e ogni battuta aggiorna solo il testo invece di ricostruire tutta la tastiera.
- **Abbinamenti:** la tastiera è alfanumerica; si può inserire la sequenza mostrata dal gioco (per esempio `1A 2C 3B`).
- **Parola Segreta / Ghigliottina:** per ogni coppia il tablet mostra i tasti **A** e **B**: ogni squadra vota, e in regia i voti compaiono sui pulsanti. Quando hanno votato tutte le pulsantiere collegate sceglie la maggioranza; in caso di parità, o quando vuoi, scegli tu. Le coppie non danno punti. Quando parte la **parola finale** compare la tastiera.
- Il server confronta la risposta digitata con la soluzione ignorando maiuscole/minuscole e accenti. In regia compare comunque la risposta scritta dalla squadra: prima di confermare i punti puoi correggere manualmente **GIUSTA / ERRATA / OMESSA**.
- Come nelle domande, una risposta non parte al primo tocco: può essere corretta finché la squadra non preme **INVIA**.
