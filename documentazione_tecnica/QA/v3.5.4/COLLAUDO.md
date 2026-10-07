# Collaudo v3.5.4_MASCOT_ANIMATED — 4 ottobre 2026

Base: release validata `Il_Secchione_v3.5.3_PACK_STUDIO.zip`, SHA-256 `dc76961d…80ed`, verificata prima della patch con 186 checksum su 186 corrispondenti.
Asset: `SECCHIONE_MASCOT_ANIMATED_ASSETS_FOR_CLAUDE.zip`, SHA-256 `5635662259368b30…46f8`.

## Test automatici (runtime Node 24.19 incluso)
| Esecuzione | Risultato | Log |
|---|---|---|
| `node tests/run.js` | **136 superati, 0 falliti**: i 130 della v3.5.3, invariati, più 6 di `tests/mascot.test.js` | `tests-unit-integration.txt` |
| `node tools/simulate_players.js` | 2/6/15/30 pulsantiere, nessuna risposta persa né duplicata | `simulation.txt` |

## Collaudo manuale (regia + SHOW remoto, server su copia temporanea)
Il pannello del browser usato per il collaudo era nascosto: il browser non avanzava le animazioni (timeline ferma, 1 fotogramma ogni 400 ms). Per questo:

- **logica** (posa, immagine, `mascotPlay`, animazione attiva): letta con `getAnimations()`;
- **ampiezze**: misurate portando ogni animazione all'istante di picco (`currentTime`) e leggendo la trasformazione calcolata.

| Verifica | Esito |
|---|---|
| present (home, anteprima domanda) | ✓ `mascot_present.webp`, ingresso 420 ms + float 2,8 s |
| think (domanda e gioco in corso) | ✓ `mascot_think.webp`, respiro 2,6 s |
| panic (tempo scaduto, domanda e Indovina) | ✓ `mascot_panic.webp` con scossa one-shot; dopo 1,4 s la soluzione con present |
| nessun panico per pausa o chiusura anticipata del docente | ✓ |
| celebrate (punti confermati) | ✓ `mascot_celebrate.webp`, salto one-shot, poi fermo |
| due celebrate di seguito (punti → classifica) | ✓ il salto riparte sulla classifica |
| ridisegni del palco (risposte registrate, omesse) | ✓ nessun ingresso, salto o scossa ripetuti |
| cambio rapido (100 ms tra un passo e l'altro) | ✓ think → present → present (soluzione) → celebrate, stato finale stabile |
| SHOW: refresh a partita in corso | ✓ posa corrente, ingresso una sola volta |
| SHOW: riconnessione dopo il riavvio del server | ✓ si ricollega da solo e segue la regia (domanda 3, think) |
| ripresa della partita dopo il riavvio | ✓ nessun panico "fantasma" |
| 1920×1080 (SHOW) | ✓ ingresso +10 px, float −5 px, salto −18,4 px (scala 1,04, −1,2°), scossa ±5,8 px (±1,6°); ritorno a 0 a fine one-shot |
| 1366×768 (SHOW) | ✓ stessi movimenti in proporzione al palco (salto −13 px, scossa ±4 px) |
| sovrapposizioni con timer, domanda, risposte e contatore al picco | ✓ nessuna, a entrambe le risoluzioni |
| movimento ridotto (`prefers-reduced-motion`) | ✓ animazioni assenti per tutte le pose, che però cambiano |
| pulsante "Mascotte: ferma" della regia | ✓ animazioni spente, pose aggiornate |
| rete | ✓ solo richieste a `127.0.0.1`, nessun 404; le 4 pose precaricate all'avvio di regia e SHOW |
| console | ✓ nessun errore |
| Player | ✓ `player.html`, `js/player.js` e `css/player.css` identici alla v3.5.3 |

Note:
- Il movimento ridotto è stato verificato applicando in pagina le regole del blocco `@media (prefers-reduced-motion: reduce)`: il pannello non permette di emulare l'impostazione del sistema.
- Non sono state prodotte schermate o GIF come file.

## Integrità
- Rispetto alla v3.5.3 sono identici byte per byte:
  - `js/host/net.js`, `server/room.js`, `server/ws.js`, `js/host/store.js`;
  - `js/engine/{scoring,timer,session,report,packstudio}.js`, `js/studio/*`, `studio.html`;
  - Player, pacchetti.
- `server/server.js` cambia solo nella stringa `VERSION`.
- I WebP in `assets/mascot/` sono identici a `assets_optimized/` del pacchetto fornito; i PNG master sono identici ad `assets/`.
- Diff completo dei file di testo: `diff_vs_v3.5.3.patch`.
