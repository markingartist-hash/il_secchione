# QA — Il Secchione v3.7.2 REVEAL FIX

Data: 5 ottobre 2026

## Test automatici

- **213 superati, 0 falliti**.
- Include regressione esplicita: nessuna mini-classifica sotto la soluzione, pagina risultati dedicata, tempi di risposta presenti, reveal inverso, recovery dello stato risultati.

## Simulazione rete

- 2 pulsantiere: OK
- 6 pulsantiere: OK
- 15 pulsantiere: OK
- 30 pulsantiere: OK
- Nessuna risposta persa; nessun duplicato.

## Collisione con una vecchia versione

Riprodotto il caso che poteva far sembrare non applicata la patch:

1. v3.7.0 avviata su una porta;
2. v3.7.2 avviata chiedendo la stessa porta;
3. v3.7.2 rileva la versione precedente;
4. non apre la vecchia regia;
5. si avvia automaticamente sulla porta successiva.

Esito: **PASS**.

## Nota

Il collaudo fisico su proiettore resta utile per confermare le dimensioni finali dei caratteri, ma la struttura ora è realmente separata: RIVELA = soluzione; AVANTI = risultati full-screen; AVANTI = contenuto successivo.
