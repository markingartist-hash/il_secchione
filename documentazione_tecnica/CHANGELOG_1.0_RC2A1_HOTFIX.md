# Il Secchione · 1.0 RC2-A.1 HOTFIX — 6 ottobre 2026

Hotfix della 1.0 RC2-A, senza nuove funzioni. Punteggio, timer e layout restano quelli della RC2-A; la Fase B (CONTENUTI) non è iniziata.

- **Base**: `Il_Secchione_1.0_RC2A_POST_PILOT_PORTABLE.zip`, SHA-256 `779802ebf333ee1f77f631d1758cd09d437eab587d5c8eabc47c0db38ca9e18c`, letta da `Desktop\casa`. Prima di modificarla: 264/264 checksum e 274 test verdi.

## 1. Tempo disponibile nei giochi (bloccante)
- **Difetto**:
  - nella RC2-A i record dei giochi non avevano `availableMs`;
  - la regia calcolava quindi in locale **200** per una risposta corretta e veloce da tablet;
  - il server, che conosceva il tempo disponibile, correggeva subito dopo.
- **Log reale della RC2-A** (Photopuzzle, 2 100 ms su 45 000 ms): `score … delta 200` → `score.server_override` → 295 (`QA/v1.0-rc2a1/log_photopuzzle_RC2A_prima.json`).
- **Correzione**:
  - `arcadeRecords()` crea i record di tutti i giochi con lo **stesso `availableMs` del round**: quello inviato al server all'apertura, più i secondi aggiunti;
  - `finalizeRound()` usa quel valore anche come riserva del calcolo locale, lo salva nel round e lo invia al server nel commit;
  - così regia e server calcolano lo stesso punteggio al primo colpo.
- **Ricalcolo**: `recomputeAllRounds()` (regia) e `recomputeTotals()` (motore) usano `rd.availableMs` del round come riserva per i record storici che non lo hanno.
- **Log reale della RC2-A.1**:
  - Photopuzzle 2 049 ms su 45 000 → `score … delta 295` → `score.verified`;
  - Indovina 4 353 ms su 45 000 → `delta 290` → `score.verified`.

## 2. Checklist «Pronto per la lezione», riga Pulsantiere
- Al posto di «2 / 2 collegate» compare «**2 tablet collegati · 4 squadre manuali**».
- Se un tablet è scollegato: «1 di 2 tablet collegati · 4 squadre manuali».
- Se tutte le squadre hanno il tablet: «2 tablet collegati».

## 3. Rettifica al report QA della RC2-A
Il report RC2-A dichiarava che il Photopuzzle +296 aveva prodotto `score.verified` senza correzione. **Era sbagliato**:
- il `score.verified` trovato apparteneva a un altro round;
- la prova ripetuta sulla RC2-A consegnata mostra `delta 200` seguito da `score.server_override`;
- il totale finale era giusto solo grazie alla correzione del server.

Dettagli e log in `QA/TEST_RESULTS_1.0_RC2A1.md`.

## Pacchetti Barocco e Preistoria 1.2.0 (contenuti, non software)
Prodotti a parte su richiesta, non sono nello ZIP del programma: `SECCHIONE_BAROCCO_3MEDIA_v1.2.0.zip` e `SECCHIONE_PREISTORIA_1MEDIA_v1.2.0.zip` in `Desktop\casa`.
- **Rispetto alla 1.1.0** sono tolti solo i campi `seconds`, quindi valgono 15 s per le domande e 45 s per le manche. Valori tolti:

  | Pack | Domande | Manche |
  |---|---|---|
  | Barocco | 5 a 30 s, 25 a 40 s | 30–35 s |
  | Preistoria | 22 a 30 s, 8 a 40 s | 30–35 s |

- **Tutto il resto è identico** (verificato campo per campo, immagini comprese).
- **Aggiornamento in classe**: PACCHETTI → ELIMINA la 1.1.0 (finisce nel cestino dei pacchetti), poi IMPORTA CONTENUTI con la 1.2.0. Il codice del pacchetto resta lo stesso, quindi le scalette continuano a funzionare.
  - Importando la 1.2.0 senza eliminare la 1.1.0, il programma conserva la vecchia e installa la nuova con un altro codice («… (2)»). È il comportamento già esistente.

## Test
- **Nuovi**: `tests/rc2a1_hotfix.test.js` (8 test):
  - Photopuzzle 2 s / 45 s = 296 nel calcolo locale;
  - Indovina 9 s / 45 s = 280;
  - Staffetta 15 s / 45 s = 267 (55 s dopo +10 s = 273);
  - corretta manuale = 200 e regola D1 nei giochi;
  - commit sul server senza correzioni (`score.verified`, `corrected = 0`);
  - ricalcolo, anche con record storici senza `availableMs`;
  - salvataggio e ripresa;
  - checklist.
- **Aggiornati**: la regex del commit in `rc2a_post_pilot.test.js`, l'estrazione della checklist in `training_rc1.test.js`, la versione in `session_planner_370.test.js`.
- **Totale**: **282 superati, 0 falliti**.
