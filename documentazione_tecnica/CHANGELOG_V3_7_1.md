# Il Secchione v3.7.1 — Keyboard + Round Reveal

Patch mirata nata da uso reale in classe. Base: v3.7.0 SESSION PLANNER.

## Tastiera testuale

- La pulsantiera **non ricostruisce più tutto il DOM a ogni lettera**: durante la digitazione aggiorna solo testo, contatore e stato di INVIA. Questo riduce drasticamente lag e tocchi persi sui tablet meno potenti.
- Layout testuale confinato sempre nel viewport: tastiera flessibile, righe che si ridimensionano, intestazione compatta, INVIA sempre visibile.
- Il testo lungo non spinge più tastiera e comandi: resta in una barra a larghezza fissa con scorrimento orizzontale automatico verso l'ultima parte scritta.
- Aggiunto contatore caratteri `n/max`.
- Rimossa la duplicazione della risposta nella riga sotto la tastiera: la riga ora mostra solo un breve aiuto (`SPAZIO ... · INVIA ...`).
- Ottimizzazione specifica per tablet in orizzontale con altezza ridotta.

## Risultati della domanda a tutto schermo

Nuovo flusso dopo una domanda:

1. **RIVELA** mostra risposta corretta e spiegazione.
2. Primo **AVANTI / PROSSIMA** chiude e registra il round (mancanti = Ø come già previsto) e apre la **CLASSIFICA DEL ROUND** a tutto schermo.
3. Secondo **AVANTI / PROSSIMA** passa al contenuto seguente.

La stessa sequenza vale dentro la **Scaletta della puntata**.

La classifica del round:

- comprende tutte le squadre;
- mette prima le risposte corrette, ordinate per velocità quando il tempo è misurato;
- poi le errate;
- poi le astensioni;
- mostra punti guadagnati/persi nel round;
- per le astensioni mostra anche `Ø n/3` e se è già penalizzata come errore;
- usa un reveal progressivo **dall'ultimo al primo posto**, con il primo posto rivelato per ultimo;
- evidenzia il podio;
- con `prefers-reduced-motion` mostra tutto immediatamente senza animazione;
- per molte squadre passa automaticamente a una griglia più compatta.

La mini-classifica nel footer della soluzione è stata sostituita da un richiamo chiaro `AVANTI → CLASSIFICA DELLA DOMANDA`, lasciando più spazio a risposta corretta e spiegazione.

## Recovery

Lo stato `roundResultsVisible` entra nello snapshot: se la regia viene ripristinata mentre è aperta la classifica del round, torna nello stesso punto del flusso.

## Non modificato

- scoring;
- regola delle 3 astensioni gratuite;
- answerMatcher;
- WebSocket / protocollo Player;
- Session Planner;
- Pack Studio;
- CSV;
- struttura dei pack;
- giochi e loro durata.
