# Il Secchione v3.7.2 — REVEAL FIX

Data: 5 ottobre 2026

## Correzioni principali

- La soluzione della domanda non contiene più alcuna mini-classifica: dopo **RIVELA**, il primo **AVANTI** apre una schermata risultati dedicata a tutto schermo; il secondo **AVANTI** passa al contenuto successivo.
- La classifica del round è stata ridisegnata per il proiettore: righe molto più grandi, posizione, squadra, esito, risposta data, **tempo di risposta**, punti del round e totale.
- Il reveal avviene realmente dall'ultimo al primo posto. Primo, secondo e terzo hanno trattamento visivo da podio; il primo viene svelato per ultimo.
- I tempi vengono mostrati sia per risposte corrette sia per risposte errate quando sono misurati dal server. Le risposte inserite manualmente sono indicate come `MANUALE`; le astensioni non inventano un tempo.
- Rimossa la vecchia mini-classifica sotto la spiegazione per non sacrificare leggibilità.
- Corretto un problema di avvio tra versioni: se una vecchia build è ancora aperta sulla porta 8765, la nuova build **non apre più silenziosamente il vecchio server**. Avvia automaticamente la versione corrente sulla porta successiva e lo segnala nella console.
- La versione corrente è visibile anche nello stato rete della regia.

## Motivo della correzione

Il comportamento osservato in aula/sul PC mostrava ancora il layout v3.7.0. La causa individuata è il riuso automatico di qualunque server `Il Secchione` già attivo sulla porta standard, senza verificare che la versione fosse la stessa. Questo poteva far aprire una build precedente anche lanciando il nuovo ZIP.
