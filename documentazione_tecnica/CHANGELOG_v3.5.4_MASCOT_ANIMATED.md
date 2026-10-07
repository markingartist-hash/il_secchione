# v3.5.4_MASCOT_ANIMATED — 4 ottobre 2026

Patch visuale isolata sulla release validata **v3.5.3_PACK_STUDIO**, che resta invariata (ZIP SHA-256 `dc76961d82e416a741d2cbc5959bb83c4e085f1394f7e69c8df018cfb3abe047`).
Asset da `SECCHIONE_MASCOT_ANIMATED_ASSETS_FOR_CLAUDE.zip`, SHA-256 `5635662259368b3021d32a1fa77b65f84205629c9e9f666140317007f86d46f8`; specifica `CLAUDE_MASCOT_INTEGRATION_PROMPT.md`.

## Cosa cambia
- **Quattro pose reali** al posto delle vecchie "pose", che riciclavano 2 soli PNG:
  - `present`, `think`, `celebrate`, `panic`;
  - sono i WebP di `assets_optimized/`, copiati byte per byte in `assets/mascot/`, senza ridisegni;
  - i PNG master e il manifest sono in `assets/sorgenti_grafiche/mascotte_animata/`, fuori dal percorso di runtime e non pubblicati in rete.
- **Stesso sistema di prima, nessun sistema parallelo**: `MASCOT_POSES`, `MOOD_SRC`, `currentMood()`, `mascotMarkup()` e `animateMascots()` sono gli stessi, con le nuove immagini.
  - Umori: `welcome` e `reveal` → present, `think` → think, `celebrate` → celebrate, `panic` → panic.
  - Le vecchie pose sono alias delle quattro reali: `point`, `host`, `artist` e `thumb` → present, `explorer` → think, `champion` → celebrate.
- **Panic** solo allo scadere del tempo, cioè lo stesso evento globale del suono `timeup`, mai per l'esito di una squadra.
  - La regola esistente "a tempo scaduto si svela la soluzione" resta: la mascotte va nel panico per 1,4 s, poi passa alla soluzione con present.
  - Pausa e chiusura anticipata del docente non provocano panico.
  - Se i punti vengono confermati subito (pulsantiere), `celebrate` resta prioritario come prima.
- **Animazioni** solo CSS (`transform` e `opacity`), in unità del palco; su 1920×1080 corrispondono ai valori della specifica:
  - present: ingresso di 420 ms (opacità 0→1, +10 px, scala 0,97→1), poi float di 5 px ogni 2,8 s;
  - think: respiro di 2,6 s (scala 1→1,012, ±0,4°), anche negli ultimi 10 s;
  - celebrate: salto one-shot di 700 ms (−18 px, scala 1,04, ±1,2°), poi fermo;
  - panic: scossa one-shot di 500 ms (±6 px, ±1,6°), poi ferma.
- **Riproduzione delle animazioni one-shot** (classe `mascotPlay`):
  - partono solo per un evento nuovo, o quando il palco viene ridisegnato entro 150 ms dall'inizio dell'evento;
  - i normali ridisegni del palco (risposte registrate, clic) non ripetono salti, scosse o ingressi;
  - due `celebrate` di seguito ripartono (chiave d'evento `data-cue`).
- **Cambio posa**: breve dissolvenza di 140 ms. Le quattro immagini vengono precaricate in regia e nello SHOW.
- **Movimento ridotto**: con `prefers-reduced-motion: reduce`, o con il pulsante esistente "Mascotte: ferma", le pose cambiano senza movimento.
- La mascotte non riceve clic né selezioni (`pointer-events: none`, `user-select: none`); `will-change: transform` vale solo per l'immagine della mascotte.
- **SHOW remoto** (`js/show-client.js`): stesse pose, precaricamento e regole di riproduzione. Il campo `mood` già presente nei messaggi del timer porta anche `panic`: nessun cambio a protocollo o server.
- Le transizioni tra domande (`index.html`, `show.html`) partono con la nuova posa present.

## File
- **Aggiunti**:
  - `assets/mascot/mascot_{present,think,celebrate,panic}.webp`
  - `assets/sorgenti_grafiche/mascotte_animata/*.png` e `mascot_manifest.json`
  - `tests/mascot.test.js`
  - `CHANGELOG_v3.5.4_MASCOT_ANIMATED.md`, `QA/v3.5.4/*`
- **Modificati**:
  - `js/app.js`: costanti della mascotte, `currentMood`, `mascotMarkup`, `animateMascots`, `VERSION`;
  - `js/show-client.js`: pose dello SHOW;
  - `css/show.css`: blocco "Mascotte animata v3.5.4" in coda;
  - `index.html`, `show.html`: immagine iniziale della transizione;
  - `server/server.js`: solo la stringa `VERSION`;
  - documentazione, `RELEASE.json`, `SHA256SUMS.txt`.
- **Invariati**, byte per byte:
  - Player (`player.html`, `js/player.js`, `css/player.css`);
  - rete (`js/host/net.js`, `server/room.js`, `server/ws.js`);
  - punteggio, timer, sessione, report e CSV;
  - Pack Studio (`js/engine/packstudio.js`, `js/studio/*`, `studio.html`);
  - persistenza (`js/host/store.js`);
  - pacchetti e giochi.
- I vecchi `assets/mascot/secchione_a.png` e `secchione_b.png` restano: li usa ancora l'anteprima di Pack Studio, che per vincolo non è stata modificata.

## Test
- `node tests/run.js`: **136 superati, 0 falliti** con il Node 24 portable incluso. Sono i 130 della v3.5.3, invariati, più 6 della mascotte.
  - asset identici a quelli forniti;
  - mappatura identica in regia e SHOW;
  - panic solo a tempo scaduto;
  - animazioni solo `transform`/`opacity` con le durate richieste;
  - Player senza mascotte;
  - pose servite anche in rete, senza 404.
- `node tools/simulate_players.js`: 2/6/15/30 pulsantiere, nessuna risposta persa o duplicata.
- Collaudo manuale in regia e SHOW: vedi [QA/v3.5.4/COLLAUDO.md](QA/v3.5.4/COLLAUDO.md).
