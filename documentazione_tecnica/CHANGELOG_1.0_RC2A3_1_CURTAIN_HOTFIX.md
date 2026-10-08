# Il Secchione · 1.0 RC2-A.3.1 CURTAIN HOTFIX — 8 ottobre 2026

Hotfix bloccante della RC2-A.3, senza altre modifiche: niente editor, punteggio o layout.

## Difetto (verificato dal docente su PC reale)
Scelto un gioco, la tendina restava sul proiettore circa un secondo, poi il gioco compariva senza nessun comando.

**Causa**: in `startArcade()` la tendina veniva accesa **dopo** `loadArcadePreset()`, che chiama `renderAll()`.
- Il primo render pubblico (finestra del proiettore e `/show`) inseriva quindi il gioco.
- La transizione temporanea «BONUS SHOW» lo copriva per 1,38 s e, sparendo, lo rivelava.

## Correzione
- **Tendina accesa prima di qualunque render**: è già nell'oggetto iniziale, `state.arcade={type,presetIndex:0,scoreCommitted:false,curtain:true}`, prima di `loadArcadePreset(0,false)`.
- **Tolta la transizione automatica del gioco** (`showTransition(gameName(type),'BONUS SHOW','★')`): la tendina è già la presentazione.
- **Invariate** le transizioni di domande, classifica e altre schermate.
- **Versione** `1.0.0-rc2a.3.1`.

## Test
- **Test corretto**: `rc2a3_show_editor.test.js`.
  - La vecchia verifica `/loadArcadePreset\(0,false\);state\.arcade\.curtain=true;/` certificava proprio l'ordine sbagliato.
  - Ora controlla che la tendina sia nell'oggetto iniziale prima del caricamento e che `startArcade` non abbia transizioni.
- **Nuovo E2E in browser**: `tests/e2e/curtain_hold.cjs`, con la finestra del proiettore aperta dalla regia e `/show`.
  - **Avvio**: per ognuno dei 5 giochi, scelto con un clic, la tendina è controllata ogni 50 ms per oltre 2 s (oltre i 1380 ms della vecchia transizione); dal clic il gioco scelto non compare mai, né nel DOM né nei messaggi ricevuti da `/show`.
  - **Cambio di manche**: dal menu e dalla freccia, sotto la tendina; poi altri 2,1 s di controllo.
  - **Comandi**: solo il tasto T, TOGLI TENDINA e TOGLI TENDINA E AVVIA rivelano il gioco; MOSTRA TENDINA la rimette.
  - **Controprova**: lo stesso E2E sul codice RC2-A.3 (`1a21ccf`) **fallisce** con «finestra del proiettore ha mostrato il gioco prima della tendina».
- **Totale suite**: **315 superati, 0 falliti**.
- **QA visiva**: `visual_games.cjs` di nuovo con 84 schermate senza problemi.
