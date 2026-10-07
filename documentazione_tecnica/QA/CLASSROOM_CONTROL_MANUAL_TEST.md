# Test realistico manuale — v3.6.0 CLASSROOM CONTROL (5 ottobre 2026)

## Ambiente
- **Build**: copia temporanea, avviata col Node 24.19 portable incluso; server su `127.0.0.1:8794`.
- **Browser**: Chromium 152.0.7977.130, il pannello browser dell'app Claude.
- **Pacchetto reale**: `SECCHIONE_BAROCCO_3MEDIA_v1.1.0.zip`, da `PACCHETTI_SECCHIONE_TRIENNIO_v1.1.0.zip`; 30 domande, 10 manche.
- **6 pulsantiere**: client WebSocket veri, con lo stesso protocollo del tablet, guidati da uno script di collaudo esterno alla build. Rispondono da soli e votano A/B (4 squadre B, 2 squadre A); per i comandi di disconnessione e riconnessione riusano il proprio token.
- **Conferme**: le `confirm()` native venivano accettate via script, perché il pannello non mostra le finestre di dialogo. I pulsanti sono quelli veri della regia.

| # | Passo | Esito |
|---|---|---|
| 1–2 | Avvio; IMPORTA dal Gestore Pacchetti e ATTIVA Barocco | ✓ v1.1.0, 30 domande |
| 3 | 6 squadre (3A…3F) | ✓ |
| 4 | 6 pulsantiere collegate e assegnate | ✓ indicatore **📱 6 / 6 COLLEGATE** |
| 5–8 | Domanda 1 in anteprima → **✎ MODIFICA DOMANDA** → risposta A→C e testo → **Salva** | ✓ resta domanda 1, fase anteprima, 6 squadre; lettera mostrata ricalcolata (B) nello stesso ordine; palco aggiornato; "✓ Modifica salvata". Su disco: pacchetto v1.1.1, copia nel cestino, nessun override nel browser (`banks: {}`) |
| 9 | AVVIA DOMANDA | ✓ 6 risposte dai tablet |
| 10–12 | Modifica durante il round → la finestra propone solo "Salva per le prossime volte" / "Salva e riavvia", con spiegazione → **Salva per le prossime volte** (risposta D, spiegazione nuova) | ✓ stesso round, alternative invariate, 6 risposte intatte, timer in corsa; "⚠ Modifica salvata. Il round corrente mantiene la versione precedente." |
| 13–14 | **✕ ANNULLA DOMANDA** | ✓ anteprima della domanda 1, risposte eliminate, 0 round e 0 risposte registrati, punteggi e squadre intatti; round **chiuso sul server** (i tablet non possono più rispondere) |
| 15–16 | Domanda riaperta | ✓ ora vale la modifica rimandata (D, spiegazione aggiornata), modifica in attesa svuotata |
| 17 | Round completo (tablet → soluzione → punti) | ✓ 3A +300, 3E +275, errate −100; progresso "giocate 1 · da giocare 29 · questa: giocata" |
| 18–19 | **↺ RIPETI DOMANDA** | ✓ anteprima pulita (nessuna risposta, ordine o tempo precedenti), punteggi invariati; il round rilanciato ha un nuovo id ed è marcato come ripetizione; 6 nuove risposte |
| — | ANNULLA del round ripetuto | ✓ punteggi invariati |
| 20–21 | Disconnessione della pulsantiera di 3B | ✓ **📱 5 / 6 COLLEGATE · Disconnessa: 3B (da 10 s, in attesa di riconnessione)**, avviso "⚠ 1 pulsantiera disconnessa: 3B", intestazione "5/6 PULSANTIERE", pallino spento; squadra e punteggio di 3B intatti |
| 22–23 | Riconnessione col token | ✓ "riconnessa" come 3B; **📱 6 / 6 COLLEGATE**; nessun dispositivo duplicato |
| 24–25 | Pack Studio → Parola Segreta "Bernini" → **＋ AGGIUNGI RISPOSTA ALTERNATIVA** ×3, elimina con ✕, alternativa "Gian Lorenzo Bernini" e doppione "bernini" → SALVA | ✓ avviso "1 risposta alternativa vuota o doppia verrà ignorata"; su disco `acceptedAnswers: ["Gian Lorenzo Bernini"]`; v1.1.3; le modifiche fatte prima dalla regia restano (una sola fonte) |
| — | La regia riceve l'avviso dello Studio → ATTIVA | ✓ manche con l'alternativa |
| 26 | **Ghigliottina sui tablet**: AVVIA | ✓ round A/B aperto sui tablet a ogni coppia; voti 4 B / 2 A sulle 5 coppie, scelta automatica a maggioranza; una scelta sbagliata dimezza il montepremi (1600); finale con tastiera |
| 27 | Finale: le 6 pulsantiere scrivono "Gian Lorenzo Bernini" | ✓ tutte **corretta**, `accepted_variant` (answerMatcher esistente); punti confermati |
| 28 | Riavvio del server e ricarica della regia → RIPRENDI | ✓ "PARTITA NON CONCLUSA TROVATA" |
| 29 | Dopo il riavvio | ✓ squadre e punteggi (3A 600 · 3B 175 · 3C 150 · 3D 125 · 3E 475 · 3F 75), 2 round, domanda 1 modificata, alternativa presente, pacchetto v1.1.3 |
| R | Refresh della regia **durante un round aperto con una modifica "per dopo" in attesa** | ✓ ripresa sulla stessa domanda col round in pausa; il round usa ancora la versione giocata (D), la modifica in attesa (A) è conservata; ANNULLA la applica |

**Console**: nessun errore, a parte due tentativi di riconnessione WebSocket durante il riavvio voluto del server.
