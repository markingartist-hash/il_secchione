# Risultati dei test · 1.0 RC2-A.1 HOTFIX

Data: 6 ottobre 2026 · Node v24.19.0 portable incluso · Windows 10 Pro 19045.

**Legenda del metodo:**
- **[ESEGUITO]**: test automatico eseguito, con risultato registrato.
- **[ESEGUITO · BROWSER]**: provato nel browser integrato dell'app Claude, con un server locale, una vera pagina `/player` collegata con il PIN e il pacchetto di collaudo `QA leggibilità` (solo nella copia di lavoro). **Non sostituisce tablet e aula reali.**
- **[NON VERIFICABILE]**: richiede hardware o persone reali.

## 1. Base [ESEGUITO]
RC2-A da `Desktop\casa`: ZIP `779802eb…a9e18c` (hash verificato), 264/264 checksum, 274 test verdi.

## 2. Rettifica del report RC2-A [ESEGUITO · BROWSER]
Ho ripetuto la prova del Photopuzzle sulla RC2-A consegnata (1.0.0-rc2a) con una pulsantiera vera.

| Build | Tempo (risposta / disponibile) | `availableMs` nei record | Calcolo locale della regia | Esito del server | Punti finali |
|---|---|---|---|---|---|
| RC2-A | 2 100 / 45 000 ms | **null** | **+200** | **`score.server_override`** | 295 |
| RC2-A.1 · Photopuzzle | 2 049 / 45 000 ms | 45 000 | **+295** | **`score.verified`** | 295 |
| RC2-A.1 · Indovina | 4 353 / 45 000 ms | 45 000 | **+290** | **`score.verified`** | 290 |

- Log originali: `QA/v1.0-rc2a1/log_photopuzzle_RC2A_prima.json`, `log_photopuzzle_RC2A1_dopo.json`, `log_indovina_RC2A1_regia_localStorage.txt`.
- **Nel report RC2-A la frase «Photopuzzle +296 … `score.verified`, nessuna correzione» era errata**: il `score.verified` citato apparteneva a un altro round della stessa sessione, non al Photopuzzle.

## 3. Test automatici [ESEGUITO]
`node tests/run.js` → **282 superati, 0 falliti** (log in `QA/v1.0-rc2a1/tests-unit-integration.txt`). Nuovi in `tests/rc2a1_hotfix.test.js`:

| Test | Esito |
|---|---|
| Photopuzzle tablet 2 s / 45 s → 296 nel calcolo locale; `availableMs` = 45 000 in tutti i record, nel round e nel commit | ✓ |
| Indovina tablet 9 s e 30 s / 45 s → 280 e 233 | ✓ |
| Staffetta 15 s / 45 s → 267; dopo +10 s (55 s) → 273 | ✓ |
| Corretta manuale nel gioco → 200; tablet + corretta manuale → tutte 200 (D1); tablet + errata manuale → bonus mantenuto (296) | ✓ |
| Server reale (`Room`): risposta da tablet 1 973 ms, commit della regia → stessi punti, `corrected = 0`, la regia registra `score.verified` e non `score.server_override` | ✓ |
| `recomputeAllRounds` → punti identici; anche togliendo `availableMs` ai record (dati storici) grazie a `rd.availableMs`; `SS.recomputeTotals` uguale | ✓ |
| Salvataggio e ripresa (giro JSON della sessione) → totali e ricalcolo identici; un gioco in corso riprende con il suo round | ✓ |
| Checklist: «2 tablet collegati · 4 squadre manuali», «1 di 2 tablet collegati · 4 squadre manuali», «2 tablet collegati», «1 tablet collegato · 1 squadra manuale» | ✓ |

## 4. Simulazione multi-tablet [ESEGUITO]
`QA/v1.0-rc2a1/simulation.txt`. Nessuna risposta persa né duplicata.

| Tablet | Risposte | ack mediana | 95° perc. | max |
|---|---|---|---|---|
| 2 | 10 | 2 ms | 3 ms | 3 ms |
| 6 | 30 | 2 ms | 3 ms | 51 ms (un solo picco) |
| 15 | 75 | 2 ms | 4 ms | 4 ms |
| 30 | 150 | 3 ms | 5 ms | 6 ms |

## 5. Browser [ESEGUITO · BROWSER]
- **Tabella § 2**: Photopuzzle e Indovina con una pulsantiera vera.
- **Checklist in regia con 4 squadre e 1 tablet**: «Pulsantiere · 1 tablet collegato · 3 squadre manuali».

## 6. Pacchetti Barocco e Preistoria 1.2.0 [ESEGUITO]
Sorgenti: `SECCHIONE_BAROCCO_3MEDIA_v1.1.0.zip` (SHA-256 `caaca8ca…`) e `SECCHIONE_PREISTORIA_1MEDIA_v1.1.0.zip` (`6cd8d6bd…`). Due copie identiche trovate sul PC.

| Verifica | Barocco 1.2.0 | Preistoria 1.2.0 |
|---|---|---|
| Durate tolte (domande) | 5 × 30 s, 25 × 40 s | 22 × 30 s, 8 × 40 s |
| Durate tolte (manche) | Photopuzzle e Parola Segreta 30 s, Indovina e Abbinamenti 35 s, Staffetta 30 s | uguale |
| Lettura con lo stesso codice di IMPORTA CONTENUTI | valida, 30 domande, 10 manche, 19/19 immagini | valida, 30 domande, 10 manche, 10/10 immagini |
| Contenuti identici alla 1.1.0 (tranne la durata) | sì | sì |
| Tutte le domande a 15 s, tutte le manche a 45 s | sì | sì |
| Importata senza eliminare la 1.1.0 | installata come `barocco_3media-2`; la 1.1.0 resta | `preistoria_1media-2`; la 1.1.0 resta |
| ELIMINA 1.1.0 → IMPORTA 1.2.0 | stesso codice `barocco_3media`, versione 1.2.0 | stesso codice `preistoria_1media`, 1.2.0 |
| SHA-256 | `7cf16f2bebb5def36cbd6b62589f935938714a5fd1ff929f034294e6e555ff15` | `ae37462dbc6fe27d63ffa756ce01580b2d4cd3a0f508ed6d0f1252ee2f49a330` |

Le prove di installazione sono state fatte su una libreria su disco temporanea con il codice del server, non nella regia del browser.

## 7. Pacchetto di consegna
Smoke test dallo ZIP estratto in una cartella con spazi: vedi il report di consegna.

## 8. Da verificare in aula [NON VERIFICABILE da qui]
Restano valide le verifiche del report RC2-A, in particolare tablet reali, proiettore e ritmo della partita. In più:
- giocare un Photopuzzle con i tablet e controllare che il punteggio mostrato subito dopo la conferma non cambi qualche istante dopo;
- importare Barocco e Preistoria 1.2.0 come descritto, sul PC della classe.
