# E2E con browser reali — solo sviluppo

La suite usa Playwright 1.62.1 e Chrome installato (oppure Edge), Node >= 18.
Non serve alcuna dipendenza npm per utilizzare il quiz: queste dipendenze servono soltanto a chi esegue gli E2E.

Dal percorso principale del progetto:

```powershell
npm --prefix tests/e2e install
.\runtime\node.exe tests/e2e/run.cjs
# Secondo browser:
$env:E2E_CHANNEL='msedge'
.\runtime\node.exe tests/e2e/run.cjs
```

Per usare una libreria Playwright già disponibile si può impostare NODE_PATH al relativo node_modules.
`E2E_ARTIFACTS` sceglie la cartella dei risultati (altrimenti una nuova cartella temporanea).
La suite copia l'app in una cartella temporanea: non modifica pack o salvataggi della copia di lavoro.
La copia viene rimossa dopo il test; i risultati restano nella cartella indicata a fine esecuzione.

Percorso verificato tramite click, scelta file e tastiera virtuale:
sei squadre → sei contesti Player separati → PIN → richiesta squadra → approvazione HOST →
MCQ → C/INVIA → ricezione → reveal automatico dopo 30 secondi → punti → seconda MCQ →
refresh Player → due manche Indovina → import/attivazione pack → terza MCQ → refresh HOST/RIPRENDI →
fallback file:// offline. Lo stato interno viene letto per le asserzioni, non usato per inviare risposte o comandare le manche.

Vengono controllati anche gli errori JavaScript, le richieste Internet e i frame WebSocket del Player.
I test bloccano le risorse HTTP esterne; il fallback file viene provato con context offline.
Gli E2E non sostituiscono un pilot fisico Wi-Fi né i test su iPad/Safari o dispositivi datati.
