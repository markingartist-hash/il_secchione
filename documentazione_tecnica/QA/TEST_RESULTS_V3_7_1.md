# QA — Il Secchione v3.7.1 KEYBOARD + ROUND REVEAL

Base verificata: `Il_Secchione_v3.7.0_SESSION_PLANNER_PORTABLE.zip`.

## Test automatici

- **212 superati**
- **0 falliti**
- baseline v3.7.0: 208
- nuovi test v3.7.1: 4 (`tests/classroom_readability_371.test.js`)

I nuovi test verificano:

1. la tastiera testuale aggiorna solo il suo stato e non ricostruisce tutto il DOM a ogni carattere;
2. primo AVANTI dopo il reveal = classifica del round, secondo AVANTI = contenuto seguente;
3. schermata risultati full-screen e ritardo di animazione invertito (ultimo → primo);
4. persistenza della schermata risultati nello snapshot/recovery.

## Simulazione rete

`node tools/simulate_players.js`

- 2 pulsantiere × 5 domande: 10 risposte, nessuna perdita/duplicato
- 6 pulsantiere × 5 domande: 30 risposte, nessuna perdita/duplicato
- 15 pulsantiere × 5 domande: 75 risposte, nessuna perdita/duplicato
- 30 pulsantiere × 5 domande: 150 risposte, nessuna perdita/duplicato

Esito: **SIMULAZIONE OK**.

## Verifiche sintattiche

- `node --check js/app.js` ✓
- `node --check js/player.js` ✓

## Nota visuale

La patch introduce CSS responsive dedicato a tastiera e classifica full-screen. La resa definitiva su proiettore/tablet reale va comunque verificata nel prossimo test in aula, perché dimensione fisica dello schermo, browser e densità del dispositivo non sono riproducibili integralmente dai test Node.
