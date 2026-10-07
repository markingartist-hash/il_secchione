# Audit iniziale della build allegata — 4 ottobre 2026

Baseline: Il_Secchione_v3.5.1_CLASSROOM_KEYBOARD_GIOCHI.zip.
SHA-256: 005f184a535edf671f4d8a5e055c78eb2de227e700b48dc7e318c532a9dfda2f.
Prima delle modifiche: 93 test superati, 0 falliti; simulazione 2/6/15/30 client,
5 domande ciascuno, nessuna risposta persa o duplicata.

| ID | Priorità | Riscontro prima della correzione | Intervento conservativo |
|---|---|---|---|
| A01 | P0 | Token Unicode della stessa lunghezza JS di un token assegnato genera RangeError in timingSafeEqual; il messaggio WebSocket non intercetta l'eccezione. | Confrontare anche la lunghezza dei buffer UTF-8. |
| A02 | P1 | Runtime assente: il doppio clic dipende da Node installato. | Includere Node Windows x64 e relativa licenza, mantenendo il launcher. |
| A03 | P1 | inflate accetta un output di 1 MiB quando il ZIP dichiara 1 byte; il controllo arriva dopo l'allocazione. | Imporre il limite durante la decompressione, anche nel fallback browser. |
| A04 | P1 | Il cambio round elimina pendingSend ma non sending: un ACK tardivo del round vecchio viene ignorato e può lasciare INVIA bloccato. | Resettare l'invio al cambio round, preservando i retry dello stesso round. |
| A05 | P1 | /host si fida del solo indirizzo loopback: Host arbitrario può ricevere la chiave; upgrade WS senza controllo Origin. | Accettare indirizzi locali/nome PC e Origin coerente. |
| A06 | P1 | Migrazione legacyImported svuota la sorgente anche se importFile fallisce. | Conservare nelle preferenze i pack non migrati. |
| A07 | P1 | Un errore dello stream statico dopo fs.stat non è gestito e può terminare il server. | Gestire l'errore e chiudere soltanto la risposta HTTP. |
| A08 | P1 | Un client SHOW può ripetere hello, essere registrato più volte e aggirare il rate limit. | Rendere idempotente il saluto SHOW e impedire cambi di ruolo sulla stessa connessione. |

Ulteriori verifiche e proposte P2 saranno riportate nell'audit finale con esito e limiti dei test. Nessuna migrazione di backend, UI o motore prevista.
