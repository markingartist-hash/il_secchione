# Test results — Il Secchione v3.6.1 CLASSROOM FLOW

Data: 5 ottobre 2026

## Baseline e ambito

Sorgente: `Il_Secchione_v3.6.0_CLASSROOM_CONTROL_PORTABLE.zip` (SHA-256 `6964457e948ab474d7181581306012f33c20be5b6a145ab9acf4d8489b461839`). La patch interviene sul flusso d'aula richiesto: timer dei giochi testuali, avanzamento/assegnazione punti, regia giochi, leggibilità del palco, mini-classifica, quota astensioni e maschera Staffetta multi-parola.

## Suite automatica

`node tests/run.js` → **190 superati, 0 falliti**.

La baseline v3.6.0 conteneva 182 test; v3.6.1 aggiunge 8 controlli dedicati a Classroom Flow. Il log completo è in `QA/v3.6.1/tests-unit-integration.txt`.

Controlli nuovi:

- prime tre omissioni gratuite e quarta penalizzata come errore senza alterare il dato grezzo `omitted`;
- quota omissioni per squadra e solo sui round confermati;
- stessa policy sul server autoritativo;
- separazione visibile di `ARA PACIS` e delle altre voci multi-parola della Staffetta Arte romana;
- 60 secondi per tutte le 33 manche del pack Arte romana;
- minimo 60 s imposto dalla regia e `PROSSIMA DOMANDA` con chiusura/omissioni/punti automatici;
- nessun salto automatico alla scheda PUNTI nei giochi e raccolta inline;
- mini-classifica post-domanda e override CSS di leggibilità presenti.

## Simulazione rete

`node tools/simulate_players.js` → **OK** con 2, 6, 15 e 30 pulsantiere: nessuna risposta persa e nessun duplicato. Log completo in `QA/v3.6.1/simulation.txt`.

## Pacchetto Arte romana

Il pack incluso `packs/arte_romana` è stato portato alla versione contenuto `3.5.1`; tutte le 33 manche hanno `seconds: 60`. La catena contenente `PACE → ARA PACIS → RILIEVO` è coperta dal test della maschera multi-parola. `packs/packs.bundle.js` è stato rigenerato.

Sono stati inoltre prodotti due ZIP aggiornati esterni:

- `arte_romana_dispense_v1.1.0.zip`: 72 domande, 33 manche, timer 60 s;
- `SECCHIONE_ARTE_ROMANA_2MEDIA_v1.2.0.zip`: 30 domande, 10 manche, timer 60 s.

Entrambi sono stati validati con il Pack Engine.

## Nota semantica sulle astensioni

Dalla quarta astensione della stessa squadra nella sessione viene applicato il punteggio previsto per `wrong`, ma il record grezzo resta `outcome=omitted` e conserva `scoringOutcome=wrong`. Questo mantiene separati il comportamento osservato e la regola di punteggio.

## Limiti dichiarati

Non è stata rilanciata una suite Playwright/browser dedicata per questa patch. I tempi della mini-classifica sono misurati per le risposte provenienti dalle pulsantiere; gli inserimenti manuali non hanno un tempo affidabile e compaiono dopo le corrette temporizzate.
