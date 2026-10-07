# Matcher condiviso delle risposte testuali

Patch sulla build `3.5.4_MASCOT_ANIMATED`, 4 ottobre 2026. Estrarre lo ZIP completo e usare il launcher portatile già presente. La versione mostrata nell'interfaccia resta quella originale.

`js/engine/answerMatcher.js` è l'unica implementazione del confronto: modulo CommonJS nel server e `window.SecchioneAnswerMatcher` nella regia. È usato da Photopuzzle, Indovina, Abbinamenti, finale della Ghigliottina e ogni collegamento della Staffetta. Le domande del quiz incluse nella build sono a scelta multipla e mantengono il loro confronto delle lettere.

```js
const { answerMatcher } = require('./js/engine/answerMatcher');
const result = answerMatcher('Caravagio', {
  answer: 'Caravaggio',
  acceptedAnswers: ['Michelangelo Merisi'],
  otherAnswers: ['Bernini', 'Borromini'] // opzionale: distrattori noti
});
// result.status === 'fuzzy'; result.isCorrect === true; result.distance === 1
```

Sono supportati anche `answerMatcher(studentAnswer, answer, acceptedAnswers)` e l'API browser `SecchioneAnswerMatcher.answerMatcher(...)`. La funzione non modifica i dati ricevuti e non assegna punti.

| status | Significato |
|---|---|
| `exact` | Risposta identica al riferimento canonico prima della normalizzazione |
| `normalized` | Riferimento canonico uguale dopo la normalizzazione |
| `accepted_variant` | Una variante dichiarata uguale dopo la normalizzazione |
| `fuzzy` | Typo ammesso sul riferimento canonico o su una variante |
| `wrong` | Nessun confronto valido |

Il risultato contiene anche `isCorrect`, `matchedAnswer`, `normalizedAnswer`, `normalizedExpected`, `source` (`answer` / `acceptedAnswers`) e `distance`. La regia conserva il risultato automatico in `entryMeta[participantId].answerMatch`; il docente continua a scegliere l'esito finale con i controlli già disponibili.

La normalizzazione applica lowercase, Unicode NFKD, rimozione dei segni diacritici, apostrofi uniformi, spazi uniformi, punteggiatura non significativa e un solo articolo italiano iniziale facoltativo (`il`, `lo`, `la`, `i`, `gli`, `le`, `un`, `uno`, `una`, `l'`). Lettere di alfabeti diversi dal latino restano testo. Segni e separatori tra cifre sono conservati, evitando di equiparare `2,5` a `25` o un numero negativo al suo positivo. Vuoti e sola punteggiatura non vengono mai accettati.

La distanza è Damerau-Levenshtein completa, comprese le trasposizioni adiacenti. Si usa la lunghezza normalizzata più corta tra risposta e riferimento: meno di 6 caratteri, nessun typo; 6–11, massimo 1; almeno 12, massimo 2. Per prudenza, anche la singola parola modificata deve rispettare la propria soglia. Il fuzzy richiede lo stesso numero e ordine di parole, ammette una sola parola modificata e vieta modifiche a parole corte e a codici/numeri. I distrattori di Indovina sono esclusi dal fuzzy, anche quando molto simili alla soluzione. Non viene dedotta la sinonimia: titoli alternativi e altri nomi validi vanno dichiarati in `acceptedAnswers`.

## Varianti nei pacchetti

Photopuzzle e Ghigliottina usano `answer`; Indovina usa `subject`, adattato al riferimento `answer` dal matcher. `acceptedAnswers` è un elenco facoltativo di stringhe della manche. Per la Staffetta va sul singolo collegamento:

```json
{
  "label": "Artisti",
  "theme": "Barocco",
  "seconds": 30,
  "links": [
    {
      "from": "Pittore",
      "to": "Caravaggio",
      "acceptedAnswers": ["Michelangelo Merisi"]
    }
  ]
}
```

Le varianti sono validate e conservate durante importazione, esportazione e caricamento delle manche. L'editor esistente conserva quelle già presenti quando si modifica o copia una manche mantenendone la soluzione; se la soluzione cambia, evita di trasferirle al nuovo riferimento. Dalla v3.6.0 si aggiungono, modificano, riordinano ed eliminano in **Pack Studio** (scheda Manche speciali, "Risposte alternative accettate"; nella Staffetta per ogni collegamento). Vuoti e doppioni dopo la normalizzazione di questo matcher vengono ignorati al salvataggio.

Il payload `round.open`, i messaggi, il trasporto di rete, il Player e le formule di scoring sono invariati. Il server applica lo stesso matcher alla soluzione canonica già trasmessa. La regia valuta anche le varianti locali e usa il commit arcade esistente per confermare il verdetto finale. Di conseguenza il feedback automatico sul tablet resta quello canonico del server: per varianti lessicali differenti e correzioni manuali, fa fede l'esito confermato in regia. Questo limite del feedback è conservato per rispettare il vincolo di non modificare UI o networking.

Il risultato del matcher è una valutazione lessicale conservativa, non un'analisi semantica generale: una parola lunga sconosciuta che differisce di una sola lettera può essere ambigua. I distrattori noti sono bloccati e il docente mantiene la correzione manuale. La replica dello stesso record del tablet non annulla la correzione, anche dopo la ripresa della sessione.

## Verifica

Eseguiti con `runtime/node.exe` incluso: **165 test superati, 0 falliti**, inclusi i 136 test preesistenti e 29 nuovi test del matcher/integrativi. Passata anche la simulazione con 2, 6, 15 e 30 pulsantiere, 5 round ciascuna, senza risposte perse o duplicate.

| Riferimento / risposta | Esito |
|---|---|
| Il Colosseo / Colosseo | `normalized` |
| L'Ara Pacis / Ara Pacis | `normalized` |
| Vocazione di San Matteo / La Vocazione di san Matteo | `normalized` |
| Caravaggio / Caravagio | `fuzzy` |
| Ratto di Proserpina / Ratto delle Sabine | **`wrong`** |

```bat
runtime\node.exe tests\run.js
runtime\node.exe tests\run.js answerMatcher
runtime\node.exe tools\simulate_players.js
runtime\node.exe tools\verify_release.js
```

Log, controllo dell'ambito della patch e confronto con lo ZIP originale: `QA/answerMatcher/`.
