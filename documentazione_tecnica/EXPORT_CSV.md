# EXPORT_CSV — contratto dei file CSV (versione 2, da v3.5.3)

Il Secchione esporta due file CSV dalla regia (scheda **CLASSIFICA → ESPORTA RISULTATI**):

| File | Contenuto |
|---|---|
| `<sessione>_risposte.csv` | una riga per risposta: domande e giochi, anche le risposte annullate (colonna `annullata`) |
| `<sessione>_log_tecnico.csv` | gli eventi della regia e del server, ordinati per orario |

Il **JSON COMPLETO** resta l'esportazione dei dati grezzi, per backup e ripresa.

## Formato (invariato rispetto alla versione 1)

- Codifica UTF-8 con BOM, così Excel riconosce gli accenti.
- Separatore `;`, righe terminate da CRLF.
- Celle tra virgolette doppie se contengono `;`, `"` o un a capo; le virgolette interne vengono raddoppiate.
- Le colonne di `_risposte.csv` sono quelle di `CSV_HEADER` in `js/engine/report.js`: nomi e ordine non cambiano.

## Neutralizzazione per i fogli di calcolo (novità della versione 2)

Alcune celle contengono testo scritto da altre persone:

- nomi delle squadre;
- testi, alternative e categorie dei pacchetti (anche di terzi);
- **risposte digitate dagli studenti** nei giochi;
- dati di classe e istituto;
- campi del log tecnico.

Se una di queste celle inizia con `=`, `+`, `-` o `@`, Excel, LibreOffice e Fogli Google potrebbero interpretarla come **formula** (*CSV/formula injection*).

Per questo, nella modalità predefinita **"foglio di calcolo"**:

- una cella di **testo** che inizia con `=` `+` `-` `@`, con un **carattere di controllo** (codici 0–31 e 127: tabulazione, ritorno a capo, a capo…) o con i corrispondenti segni a larghezza piena (`＝ ＋ － ＠`) viene preceduta da un apostrofo `'`;
- i **numeri** non vengono toccati, anche se negativi. Le penalità restano numeri, ad esempio `-100`, così come i tempi in millisecondi. Restano invariati anche i testi che sono solo un numero, come `-2` o `+5`;
- tutti gli altri testi restano identici.

| Valore registrato | Cella nel CSV |
|---|---|
| `=HYPERLINK("…")` | `'=HYPERLINK("…")` |
| `+39 333 1234567` | `'+39 333 1234567` |
| `@SUM(A1)` | `'@SUM(A1)` |
| `-100` (punti) | `-100` |
| `Roma` | `Roma` |

Nel foglio di calcolo l'apostrofo può comparire davanti al testo: è voluto e indica che la cella è trattata come testo.

## Modalità "dati grezzi" (RAW)

I pulsanti della regia producono **sempre** la versione per i fogli di calcolo. La versione grezza non ha un pulsante: non va aperta con Excel, perché le celle non sono protette.

- Per un archivio completo usa il **JSON COMPLETO**.
- Chi rielabora i file con un programma può chiedere il CSV con le celle esattamente come registrate:

```js
SecchioneReport.toCSV(contesto, { raw: true });
SecchioneReport.logToCSV(logRegia, logServer, { raw: true });
```

Se rileggi un CSV in modalità foglio di calcolo, ricava il valore originale così: togli l'apostrofo iniziale **solo** se è seguito da uno dei caratteri elencati sopra.

`SecchioneReport.CSV_CONTRACT` riporta la versione del contratto, oggi `2`.
I test sono in `tests/csv_safety.test.js`.
