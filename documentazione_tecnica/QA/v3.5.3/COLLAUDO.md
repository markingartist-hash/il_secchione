# Collaudo v3.5.3_PACK_STUDIO — 4 ottobre 2026

Baseline: `Il_Secchione_v3.5.2_PILOT_PORTABLE.zip`, SHA-256 `f56ddf2994e0ea9fbfe64fd17f7e6f40be0326d09960bd440a86c9a7738180ed`.
Prima delle modifiche la baseline dava 106 test superati e 0 falliti.

## Test automatici
| Esecuzione | Risultato | Log |
|---|---|---|
| `node tests/run.js`, Node 24.19 incluso | 130 superati, 0 falliti | `tests-unit-integration.txt` |
| `node tests/run.js`, Node 24.21 | 130 superati, 0 falliti | — |
| `node tests/run.js`, Node 8.16 / 8.11 (solo informativo, runtime non supportato) | 128 superati, 2 falliti; gli stessi 2 falliscono sulla baseline perché usano API di Node 10 o successivo | `tests-node8.txt` |
| `node tools/simulate_players.js` | 2/6/15/30 pulsantiere, nessuna risposta persa né duplicata | `simulation.txt` |
| Sonda CSV `=1+1` | neutralizzata (`'=1+1`); in modalità grezza resta invariata | `csv-probe.json` |

## File cambiati rispetto alla baseline
- **Aggiunti**:
  - `studio.html`, `css/studio.css`
  - `js/engine/packstudio.js`, `js/studio/studio.js`, `js/studio/drafts.js`
  - `tests/packstudio.test.js`, `tests/csv_safety.test.js`
  - `PACK_STUDIO.md`, `EXPORT_CSV.md`, `CHANGELOG_v3.5.3_PACK_STUDIO.md`, `QA/v3.5.3/*`
- **Modificati, solo con aggiunte**:
  - `server/server.js` (route `PUT` e `/studio`) e `server/packstore-disk.js` (`writeTree`, `replace`), più la stringa `VERSION` in `server.js`;
  - `js/engine/packlib.js` (`save`, `replace` in memoria, avviso sulle sottocartelle, esportazione di `extractInlineImages`);
  - `js/host/packs-client.js` (`replace` IndexedDB, `save`, `openBytes`);
  - `js/host/packs-ui.js` (pulsanti PACK STUDIO e MODIFICA, avviso dalla finestra dello Studio);
  - `css/classroom.css` (una regola).
- **Modificati**:
  - `js/engine/report.js`: contratto CSV v2;
  - `index.html`: didascalia del pulsante RISPOSTE CSV;
  - `js/app.js`: la stringa `VERSION` e l'aggancio `dropOverrides` passato alla schermata Pacchetti (una riga, unica fonte dopo un salvataggio dallo Studio);
  - documentazione e `RELEASE.json`, `SHA256SUMS.txt`.
- **Invariati**: `server/room.js`, `server/ws.js`, `js/lib/zip.js`, `js/player.js`, `css/player.css`, tutti i test della v3.5.2 e `runtime/`.

## Collaudo manuale nel browser (Chromium del pannello dell'app)
Eseguito su una copia temporanea, così la cartella di consegna è rimasta pulita: server su `127.0.0.1:8790`, modalità senza server simulata con un server statico senza chiave regia.

- **Nuovo pacchetto**:
  - titolo, materia, classe e autore;
  - prima domanda con alternative, risposta corretta, spiegazione, argomento e tag;
  - immagine caricata, rinominata in modo sicuro (`Arco di Tito (foto).JPG` → `arco_di_tito_foto.jpg`);
  - anteprima domanda e soluzione.
- **Manche**:
  - Indovina, con la soluzione che segue la modifica del testo dell'alternativa;
  - Parola Segreta, con errore a 4 coppie che scompare alla quinta;
  - Staffetta da riga unica, duplicata e spostata;
  - Photopuzzle e Abbinamenti con 4 immagini.
- **Salvataggio con il server**:
  - nuovo pacchetto in `packs/` con l'immagine direttamente in `images/` e il bundle aggiornato;
  - aggiornamento con conferma, versione da 1.0.0 a 1.0.1 e copia in `data/cestino_pacchetti/`.
- **Regia aperta nello stesso momento**:
  - l'elenco PACCHETTI si aggiorna da solo, con un avviso;
  - con il pacchetto in gara la partita non cambia;
  - dopo ATTIVA entrano le nuove domande (2 domande, 45 s).
- **Esportazione e riapertura**:
  - ESPORTA ZIP (download intercettato) con 4 file e immagine piatta;
  - riapertura da file;
  - conflitto di codice con scelta "salva come nuovo" (`vulcani_d_italia-2`).
- **Bozze**:
  - autosalvataggio, ricaricamento della pagina, ripresa con testo e immagini;
  - eliminazione delle bozze con l'archivio svuotato, immagini comprese.
- **Arte romana completo**: aperto in circa 0,2 s, 0 errori, 1 avviso (immagine non usata `cesare.jpg`); rinomina di `arco.jpg` con riferimenti aggiornati nelle domande 3 e 12.
- **Validazione**: alternativa vuota segnalata nell'elenco e in linea; badge 1; salvataggio bloccato; clic sul problema che riporta alla domanda 5.
- **Senza server** (libreria del browser):
  - pacchetti del programma in sola lettura;
  - creazione, salvataggio, aggiornamento senza copia (avviso mostrato) e riapertura;
  - attivazione nella regia senza server.
- **Console**: nessun errore JavaScript in Studio e regia.

## Pacchetti reali (PACCHETTI_SECCHIONE_TRIENNIO_v1.1.0.zip)
Copia temporanea, server su `127.0.0.1:8792`.

| Pacchetto | Importazione | Studio |
|---|---|---|
| SECCHIONE_PREISTORIA_1MEDIA_v1.1.0 (1,1 MB, 30 domande, 10 manche, 10 immagini) | ✓ dal pulsante IMPORTA | ciclo completo, vedi sotto |
| SECCHIONE_ARTE_ROMANA_2MEDIA_v1.1.0 (2,3 MB, 30, 10, 15) | ✓ | apertura in 0,2 s, 0 errori; modificate una domanda e una Parola Segreta; salvato in 1,3 s con copia nel cestino |
| SECCHIONE_BAROCCO_3MEDIA_v1.1.0 (8,8 MB, 30, 10, 19) | ✓ | apertura in 0,2 s, 0 errori; modificate una domanda e una Parola Segreta; salvato in 1,3 s con copia nel cestino |

Ciclo completo su Preistoria:

0. **Override della regia**: dall'ARCHIVIO della regia modificata la domanda 2. È finita in `banks.preistoria_1media`, fuori dal pacchetto.
1. **Apri in Studio**: la bozza include la domanda 2 modificata dalla regia, con l'avviso al docente.
2. **Modifiche**:
   - domanda 5: testo, spiegazione, 50 s e immagine nuova (`Foto nuova Studio.jpg` → `foto_nuova_studio.jpg`);
   - Indovina 1: titolo e primo indizio;
   - Photopuzzle 1: immagine sostituita (`pantheon_sostituta.jpg`).
3. **Salva** con conferma: versione da 1.1.0 a 1.1.1 e copia `preistoria_1media_…_prima-della-modifica` nel cestino. Override eliminato dal browser, dalla memoria della regia e da `data/prefs.json`.
4. **Su disco**: entrambe le modifiche alle domande, il gioco e le 2 immagini nuove direttamente in `images/`.
5. **Gioca**: dopo ATTIVA la domanda 5 va in gara con il testo nuovo, 50 s, immagine e spiegazione nuove. Indizio nuovo sul palco, Photopuzzle con l'immagine sostituita; le immagini nuove si scaricano anche dall'indirizzo LAN (200), mentre `/studio` dalla LAN dà 403.
6. **Riavvio** del server e ricarico della regia: domande modificate in gara.
7. **Esporta** dal Gestore Pacchetti: `preistoria_1media_v1.1.1.zip` contiene tutte le modifiche e 12 immagini piatte.
8. **Elimina** il pacchetto, che va nel cestino separato dalla copia di sicurezza.
9. **Reimporta** lo ZIP: installato con lo stesso codice.
10. **Verifica**: in gara tutte le modifiche e le immagini (200); lo Studio lo riapre come «Salvato nella libreria», senza override.

## Non eseguito
- Suite E2E Playwright di sviluppo (`tests/e2e/`): richiede Playwright, non installato.
- Apertura diretta da `file://`: il pannello browser dell'app non apre file fuori dal progetto. La modalità senza server è stata provata via http senza chiave regia, che usa lo stesso codice.
- Prova di usabilità con un docente non tecnico (TEST_CHECKLIST S9).
- Ciclo completo su `file://` vero, con esportazione dopo la riapertura del browser: la stessa lettura da IndexedDB è stata verificata via http senza chiave regia (salva, riapri, attiva).
