# v3.6.1 CLASSROOM FLOW — 5 ottobre 2026

Patch derivata dall'uso reale in classe della v3.6.0. L'obiettivo è ridurre i clic del docente e rendere più leggibile il palco senza cambiare protocollo, matcher o struttura dei pacchetti.

## Modifiche

- **60 secondi nei giochi a risposta scritta**: Photopuzzle, Indovina, Abbinamenti, Staffetta e finale della Parola Segreta usano almeno 60 s. I nuovi giochi creati in Pack Studio partono da 60 s. Le domande A/B/C/D restano con il proprio tempo.
- **PROSSIMA DOMANDA = chiudi + omissioni + punti + avanti**: se una domanda è ancora aperta, il comando chiude il round, trasforma i mancanti in omissioni, registra il punteggio e passa alla domanda successiva senza chiedere una seconda conferma.
- **Regia giochi più compatta**: allo scadere non si viene più spostati nella scheda PUNTI. Risposte e punteggi del gioco sono disponibili direttamente sotto i suoi comandi.
- **Palco più leggibile**: più larghezza a domanda e alternative, font più grandi quando il testo lo consente, colonna timer/mascotte ridotta e adattamento per testi lunghi.
- **Mini-classifica della domanda**: dopo il reveal mostra le corrette in ordine di velocità, quindi errate e astensioni. Il tempo è mostrato quando proviene dalla pulsantiera.
- **3 astensioni gratuite per squadra e per partita**: le prime tre valgono 0; dalla quarta l'astensione conserva `outcome=omitted` nei dati grezzi ma usa il punteggio della risposta errata. La regia mostra il contatore Ø.
- **Staffetta multi-parola**: la maschera separa chiaramente lettere e parole. `ARA PACIS` non appare più come una fila indistinta di trattini; gli spazi non consumano gli aiuti.
- **Arte romana aggiornata**: il pack completo incluso nella build ha tutte le 33 manche testuali a 60 s e contiene la catena `PACE → ARA PACIS → RILIEVO` verificata con la nuova maschera.

## Dati e compatibilità

La distinzione tra prestazione e punteggio resta intatta: una quarta astensione non viene falsificata come errore nel record grezzo. Il server ricalcola la stessa regola della regia. Nessuna modifica al protocollo PLAYER/SHOW e nessuna dipendenza Internet aggiunta.
