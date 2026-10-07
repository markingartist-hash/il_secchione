# NETWORK_SETUP — tablet, rete e server locale

**Offline significa "senza Internet", non "senza rete".** I tablet parlano direttamente con il PC del docente sulla rete locale (Wi-Fi). Nessun dato esce dalla scuola e non serve alcuna connessione a Internet.

La **modalità manuale** non usa la rete e funziona sempre. È il paracadute se una delle soluzioni qui sotto non va.

---

## 1. Avvio autonomo della v3.5.2_PILOT

Il pacchetto include `runtime/node.exe` (Node v24.19.0, Windows x64) e `runtime/LICENSE.txt`.
Estrai **tutta** la cartella, poi fai doppio clic su `AVVIA_IL_SECCHIONE.bat`.
Non serve installare Node o eseguire `npm install`. Il BAT originale sceglie prima il runtime incluso.
Il test di release è stato eseguito con PATH limitato a `C:\Windows\System32`, in una cartella con spazi.

La build portable è destinata a PC Windows x64 moderni; non è stata verificata su Windows 7/8,
Windows ARM o sistemi a 32 bit. I tablet non eseguono Node: usano il browser.
Se manca `runtime/node.exe`, riestrai lo ZIP completo. Rimane disponibile il fallback
`AVVIA_SENZA_TABLET.bat`, che apre il quiz direttamente da file.

### Firewall di Windows
Al primo avvio Windows può chiedere: *"Consentire a Node.js di comunicare su queste reti?"*
- spunta **Reti private** e premi **Consenti accesso**;
- se la rete della scuola è classificata come **pubblica**, Windows può bloccare i tablet anche dopo il consenso. In quel caso usa l'hotspot del PC (opzione B), oppure chiedi al tecnico di consentire Node.js sulla porta **8765**.

Il Secchione **non modifica** il firewall né le impostazioni di rete: ogni consenso resta una scelta del docente o del tecnico.

---

## 2. Tre modi per collegare i tablet

### A. Wi-Fi della scuola
PC e tablet sulla stessa rete Wi-Fi. È la soluzione più semplice, **quando funziona**.

Molte reti scolastiche usano l'*isolamento dei client* (client isolation) o reti separate (VLAN) per i dispositivi degli studenti: i tablet vedono Internet ma non il PC del docente. Il Secchione non tenta di aggirare queste protezioni. Se il test rete fallisce, passa all'opzione B o C.

### B. Hotspot del PC del docente (consigliato per i pilot)
1. Windows: **Impostazioni → Rete e Internet → Hotspot mobile → Attiva**. Annota nome e password.
2. Collega i tablet a quella rete.
3. Avvia `AVVIA_IL_SECCHIONE.bat`: l'indirizzo per i tablet sarà di solito `http://192.168.137.1:8765/player` (segnalato come "hotspot Windows").

Funziona anche se il PC non ha Internet: in quel caso Windows potrebbe richiedere una connessione per attivare l'hotspot, e conviene provarlo prima della lezione. Regge in genere 8 dispositivi (il limite dipende dalla scheda Wi-Fi del PC).

### C. Router Wi-Fi dedicato (consigliato per 15–30 tablet)
Un piccolo router portatile, non collegato a Internet:
1. collega il PC al router (cavo o Wi-Fi);
2. collega i tablet allo stesso router;
3. avvia il Secchione e usa l'indirizzo mostrato in regia.

È la soluzione più stabile per una classe intera o per un torneo d'istituto in aula magna.

---

## 3. Verifica prima della lezione (2 minuti)

1. Avvia `AVVIA_IL_SECCHIONE.bat`. La finestra nera mostra gli indirizzi e la regia si apre nel browser.
2. In regia: **📱 PULSANTIERE → QR test rete**.
3. Da un tablet inquadra il QR oppure apri `http://<indirizzo>:8765/network-test`.

| Risultato sul tablet | Significato | Cosa fare |
|---|---|---|
| **RETE OK** | Pagine e canale in tempo reale funzionano | Puoi usare le pulsantiere |
| **RETE LENTA MA USABILE** | Latenza mediana oltre 300 ms | Avvicina i tablet al Wi-Fi o usa un router dedicato |
| **PROBLEMI DI RETE** | Connessione instabile | Opzione B o C, oppure modalità manuale |
| La pagina **non si apre** | Il tablet non raggiunge il PC | Isolamento dei client o firewall: opzione B o C, oppure modalità manuale |

La finestra PULSANTIERE della regia mostra in diretta: indirizzo IP, porta, QR, PIN, dispositivi connessi e latenza di ciascuno.

### Più indirizzi?
Se il PC ha più schede di rete (Wi-Fi, cavo, VirtualBox, Hyper-V…), il Secchione mette per primo l'indirizzo più probabile e segnala quelli virtuali. Gli altri sono in "Altri indirizzi del PC".

---

## 4. Porte e indirizzi

| Indirizzo | Chi lo usa |
|---|---|
| `http://localhost:8765/host` | la regia, **solo** sul PC del docente |
| `http://<IP-del-PC>:8765/player` | le pulsantiere |
| `http://<IP-del-PC>:8765/show` | un eventuale secondo schermo collegato via rete (sola lettura) |
| `http://<IP-del-PC>:8765/network-test` | la verifica rete |

Porta occupata? La finestra nera lo segnala. Se un altro programma usa la 8765, chiudilo oppure avvia da terminale:

```bash
node server/server.js --open --port 8766
```

Se Il Secchione è già in esecuzione, un secondo avvio apre semplicemente la regia esistente.

---

## 5. Cosa può vedere un tablet

Dagli altri dispositivi sono raggiungibili **solo** la pulsantiera, il test rete, il palco remoto, i fogli di stile e le immagini.

**Non** sono raggiungibili: la regia, la banca domande (`packs/*.json`, `packs/packs.bundle.js`), `SOLUZIONI_DOCENTE.html`, i file di codice della regia, la cartella `data/` con i salvataggi e i token.

La soluzione di una domanda non viene mai inviata ai tablet prima del reveal. Il server la conserva e la usa solo per calcolare l'esito.
