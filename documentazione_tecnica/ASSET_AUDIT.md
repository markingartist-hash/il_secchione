# ASSET_AUDIT — Il Secchione v3.5 CLASSROOM

Generato da `node tools/asset_audit.js` il 2026-10-03. 56 file, 13.5 MB, 0 file con contenuto duplicato.

**Licenze:** nessuna licenza è stata inventata. Dove origine o licenza non sono documentate lo stato è `DA VERIFICARE`.
Prima di qualsiasi distribuzione al di fuori della propria classe, o di una commercializzazione, ogni riga `DA VERIFICARE` va chiarita (autore, permesso, licenza) oppure l'asset va sostituito.

## Deduplicazione rispetto alla v3

Nella v3 c'erano 12 PNG della mascotte (941×1670, circa 1,1 MB ciascuno, 13,3 MB in tutto) ma **solo 2 contenuti distinti**: la stessa figura nelle due direzioni. In v3.5 ci sono 2 file 620×1100, ridimensionati in alta qualità e sufficienti fino a un proiettore 1080p a tutto schermo. La mappa delle pose è in `js/app.js` (`MASCOT_POSES`, `MOOD_SRC`).

| File v3 | Hash v3 (prefisso) | File v3.5 |
|---|---|---|
| assets/mascot/artist.png | `d52ffb11234f505c` | secchione_a.png |
| assets/mascot/explorer.png | `d52ffb11234f505c` | secchione_a.png |
| assets/mascot/host.png | `d52ffb11234f505c` | secchione_a.png |
| assets/mascot/idle.png | `d52ffb11234f505c` | (non usato) |
| assets/mascot/jump.png | `d52ffb11234f505c` | (non usato) |
| assets/mascot/present.png | `d52ffb11234f505c` | secchione_a.png |
| assets/mascot/scholar.png | `d52ffb11234f505c` | (non usato) |
| assets/mascot/champion.png | `fc78b7eebc53f7b5` | secchione_b.png |
| assets/mascot/point.png | `fc78b7eebc53f7b5` | secchione_b.png |
| assets/mascot/scientist.png | `fc78b7eebc53f7b5` | secchione_b.png |
| assets/mascot/thumb.png | `fc78b7eebc53f7b5` | secchione_b.png |
| assets/mascot/walk.png | `fc78b7eebc53f7b5` | (non usato) |

Altri file della v3 non referenziati dall'app sono stati spostati o segnalati:
- `assets/logo.png` e `assets/logo_clean.png` sono stati spostati in `assets/sorgenti_grafiche/`: non vengono caricati dall'app e restano disponibili per la stampa.
- `immagini/romana/cesare.jpg`, ora `packs/arte_romana/images/cesare.jpg`, non è usata da nessuna domanda o manche. È disponibile per l'editor.

## Audio: scelta del formato

I 23 effetti restano in **WAV** (8,3 MB). Il motivo è che l'audio è riprodotto solo dalla regia sul PC del docente: i tablet non scaricano mai l'audio e il palco remoto `/show` è muto, quindi la dimensione non pesa sulla rete. Il WAV si riproduce senza decodifica in Chrome, Edge, Firefox e Safari/iPad.
Sul PC di sviluppo non era disponibile un encoder (ffmpeg). Una conversione in MP3 o AAC ridurrebbe circa 7 MB senza un vantaggio pratico in classe, quindi non è stata fatta, coerentemente con il principio "stabilità prima di pochi MB". Se in futuro servirà un pacchetto più leggero: MP3 a 128 kbps è il formato più compatibile, e basta cambiare le estensioni nella costante `SOUND` di `js/app.js`.

## Elenco completo

| File | SHA-256 | Dimensione | Duplicato | Usato dall'app | Origine nota | Licenza nota | Stato |
|---|---|---|---|---|---|---|---|
| assets/logo_clean.svg | `61b70f46c633c053…` | 1 KB | no | sì | Logo del progetto (fornito con la v3) | non documentata | DA VERIFICARE |
| assets/mascot/secchione_a.png | `eae858ca8aef6ec4…` | 628 KB | no | sì | Mascotte del progetto (fornita con la v3); autore e strumento di creazione non documentati | non documentata | DA VERIFICARE |
| assets/mascot/secchione_b.png | `09467a76c7638a95…` | 629 KB | no | sì | Mascotte del progetto (fornita con la v3); autore e strumento di creazione non documentati | non documentata | DA VERIFICARE |
| assets/sorgenti_grafiche/logo.png | `d7aba11c3d8c845a…` | 754 KB | no | no | Sorgenti grafiche del logo (v3), non usate dall'app | non documentata | DA VERIFICARE |
| assets/sorgenti_grafiche/logo_clean.png | `bc7492711f3a16b8…` | 352 KB | no | no | Sorgenti grafiche del logo (v3), non usate dall'app | non documentata | DA VERIFICARE |
| assets/sounds_hq/arcade_start_hq.wav | `67d9a9403de838d9…` | 345 KB | no | sì | Effetti sonori forniti con la v3; provenienza non documentata | non documentata | DA VERIFICARE |
| assets/sounds_hq/chain_bed_hq.wav | `038e5a7dffed45bd…` | 1034 KB | no | sì | Effetti sonori forniti con la v3; provenienza non documentata | non documentata | DA VERIFICARE |
| assets/sounds_hq/correct_hq.wav | `45a35060cb00e4fe…` | 250 KB | no | sì | Effetti sonori forniti con la v3; provenienza non documentata | non documentata | DA VERIFICARE |
| assets/sounds_hq/final_answer_hq.wav | `684438cab29696f8…` | 319 KB | no | sì | Effetti sonori forniti con la v3; provenienza non documentata | non documentata | DA VERIFICARE |
| assets/sounds_hq/gh_bed_hq.wav | `c233514162d0e6ae…` | 1034 KB | no | sì | Effetti sonori forniti con la v3; provenienza non documentata | non documentata | DA VERIFICARE |
| assets/sounds_hq/gh_cut_hq.wav | `eb45b362de59782c…` | 138 KB | no | sì | Effetti sonori forniti con la v3; provenienza non documentata | non documentata | DA VERIFICARE |
| assets/sounds_hq/gh_final_hq.wav | `e34bd6ed5cdd815d…` | 388 KB | no | sì | Effetti sonori forniti con la v3; provenienza non documentata | non documentata | DA VERIFICARE |
| assets/sounds_hq/gh_halve_hq.wav | `70d963fcffc27162…` | 181 KB | no | sì | Effetti sonori forniti con la v3; provenienza non documentata | non documentata | DA VERIFICARE |
| assets/sounds_hq/gh_select_hq.wav | `f457a8fa3aa4db34…` | 55 KB | no | sì | Effetti sonori forniti con la v3; provenienza non documentata | non documentata | DA VERIFICARE |
| assets/sounds_hq/gh_survive_hq.wav | `de3fc422e559ad20…` | 146 KB | no | sì | Effetti sonori forniti con la v3; provenienza non documentata | non documentata | DA VERIFICARE |
| assets/sounds_hq/indovina_bed_hq.wav | `46279e6a7a3a81c7…` | 1034 KB | no | sì | Effetti sonori forniti con la v3; provenienza non documentata | non documentata | DA VERIFICARE |
| assets/sounds_hq/leaderboard_hq.wav | `f6d7359c0814882c…` | 457 KB | no | sì | Effetti sonori forniti con la v3; provenienza non documentata | non documentata | DA VERIFICARE |
| assets/sounds_hq/letter_reveal_hq.wav | `6bdf747b6bffe641…` | 52 KB | no | sì | Effetti sonori forniti con la v3; provenienza non documentata | non documentata | DA VERIFICARE |
| assets/sounds_hq/question_in.wav | `3e424b9040ce8e8a…` | 207 KB | no | sì | Effetti sonori forniti con la v3; provenienza non documentata | non documentata | DA VERIFICARE |
| assets/sounds_hq/rank_lock_hq.wav | `77f688382e2321b1…` | 43 KB | no | sì | Effetti sonori forniti con la v3; provenienza non documentata | non documentata | DA VERIFICARE |
| assets/sounds_hq/reveal_hq.wav | `73f5a6423fa4d160…` | 267 KB | no | sì | Effetti sonori forniti con la v3; provenienza non documentata | non documentata | DA VERIFICARE |
| assets/sounds_hq/tick_soft_hq.wav | `0fced9af9370dc2a…` | 31 KB | no | sì | Effetti sonori forniti con la v3; provenienza non documentata | non documentata | DA VERIFICARE |
| assets/sounds_hq/tick_urgent_hq.wav | `132c1d3f5f231507…` | 38 KB | no | sì | Effetti sonori forniti con la v3; provenienza non documentata | non documentata | DA VERIFICARE |
| assets/sounds_hq/timer_bed_hq.wav | `6d62b5f49ab8e460…` | 1034 KB | no | sì | Effetti sonori forniti con la v3; provenienza non documentata | non documentata | DA VERIFICARE |
| assets/sounds_hq/timer_start_hq.wav | `895d18691310caa7…` | 164 KB | no | sì | Effetti sonori forniti con la v3; provenienza non documentata | non documentata | DA VERIFICARE |
| assets/sounds_hq/time_up_hq.wav | `05c7327ff61a0f5a…` | 241 KB | no | sì | Effetti sonori forniti con la v3; provenienza non documentata | non documentata | DA VERIFICARE |
| assets/sounds_hq/transition_soft.wav | `984930162dc413d1…` | 439 KB | no | sì | Effetti sonori forniti con la v3; provenienza non documentata | non documentata | DA VERIFICARE |
| assets/sounds_hq/wrong_hq.wav | `d8aa0ce37962e763…` | 198 KB | no | sì | Effetti sonori forniti con la v3; provenienza non documentata | non documentata | DA VERIFICARE |
| packs/arte_romana/images/ara_corteo.jpg | `17bf6bf0373061ef…` | 280 KB | no | sì | Estratta dalle dispense "Arte romana repubblicana" e "Arte romana imperiale" usate in classe (LEGGIMI v3) | non documentata | DA VERIFICARE |
| packs/arte_romana/images/ara_pacis.jpg | `260f85d44edea826…` | 400 KB | no | sì | Estratta dalle dispense "Arte romana repubblicana" e "Arte romana imperiale" usate in classe (LEGGIMI v3) | non documentata | DA VERIFICARE |
| packs/arte_romana/images/arco.jpg | `6bd7008df8c61f32…` | 73 KB | no | sì | Estratta dalle dispense "Arte romana repubblicana" e "Arte romana imperiale" usate in classe (LEGGIMI v3) | non documentata | DA VERIFICARE |
| packs/arte_romana/images/arco_augusto.jpg | `18c970b18680e6dc…` | 220 KB | no | sì | Estratta dalle dispense "Arte romana repubblicana" e "Arte romana imperiale" usate in classe (LEGGIMI v3) | non documentata | DA VERIFICARE |
| packs/arte_romana/images/atrio.jpg | `1609af3f0f456699…` | 109 KB | no | sì | Estratta dalle dispense "Arte romana repubblicana" e "Arte romana imperiale" usate in classe (LEGGIMI v3) | non documentata | DA VERIFICARE |
| packs/arte_romana/images/augusto.jpg | `9b9c66529cba3002…` | 65 KB | no | sì | Estratta dalle dispense "Arte romana repubblicana" e "Arte romana imperiale" usate in classe (LEGGIMI v3) | non documentata | DA VERIFICARE |
| packs/arte_romana/images/barberini.jpg | `e150350e609adcf4…` | 79 KB | no | sì | Estratta dalle dispense "Arte romana repubblicana" e "Arte romana imperiale" usate in classe (LEGGIMI v3) | non documentata | DA VERIFICARE |
| packs/arte_romana/images/cesare.jpg | `bfb3a91dea085e62…` | 79 KB | no | no | Estratta dalle dispense "Arte romana repubblicana" e "Arte romana imperiale" usate in classe (LEGGIMI v3) | non documentata | DA VERIFICARE |
| packs/arte_romana/images/colosseo.jpg | `5f1d602f5c360e2a…` | 285 KB | no | sì | Estratta dalle dispense "Arte romana repubblicana" e "Arte romana imperiale" usate in classe (LEGGIMI v3) | non documentata | DA VERIFICARE |
| packs/arte_romana/images/costantino.jpg | `7bd56abed26a8860…` | 99 KB | no | sì | Estratta dalle dispense "Arte romana repubblicana" e "Arte romana imperiale" usate in classe (LEGGIMI v3) | non documentata | DA VERIFICARE |
| packs/arte_romana/images/ercole.jpg | `e84161251aa3db21…` | 173 KB | no | sì | Estratta dalle dispense "Arte romana repubblicana" e "Arte romana imperiale" usate in classe (LEGGIMI v3) | non documentata | DA VERIFICARE |
| packs/arte_romana/images/fregio.jpg | `7bd79a44ca2772b4…` | 293 KB | no | sì | Estratta dalle dispense "Arte romana repubblicana" e "Arte romana imperiale" usate in classe (LEGGIMI v3) | non documentata | DA VERIFICARE |
| packs/arte_romana/images/insula.jpg | `3edea0477b3b39bd…` | 276 KB | no | sì | Estratta dalle dispense "Arte romana repubblicana" e "Arte romana imperiale" usate in classe (LEGGIMI v3) | non documentata | DA VERIFICARE |
| packs/arte_romana/images/lorica.jpg | `53081d09ba2cd4eb…` | 121 KB | no | sì | Estratta dalle dispense "Arte romana repubblicana" e "Arte romana imperiale" usate in classe (LEGGIMI v3) | non documentata | DA VERIFICARE |
| packs/arte_romana/images/marco_aurelio.jpg | `40b6f0961bfe71fd…` | 55 KB | no | sì | Estratta dalle dispense "Arte romana repubblicana" e "Arte romana imperiale" usate in classe (LEGGIMI v3) | non documentata | DA VERIFICARE |
| packs/arte_romana/images/pantheon.jpg | `d45eef31423e39ec…` | 146 KB | no | sì | Estratta dalle dispense "Arte romana repubblicana" e "Arte romana imperiale" usate in classe (LEGGIMI v3) | non documentata | DA VERIFICARE |
| packs/arte_romana/images/pantheon_esterno.jpg | `deaa0488adeec78a…` | 46 KB | no | sì | Estratta dalle dispense "Arte romana repubblicana" e "Arte romana imperiale" usate in classe (LEGGIMI v3) | non documentata | DA VERIFICARE |
| packs/arte_romana/images/patrizio.jpg | `056a28e16153cd0f…` | 92 KB | no | sì | Estratta dalle dispense "Arte romana repubblicana" e "Arte romana imperiale" usate in classe (LEGGIMI v3) | non documentata | DA VERIFICARE |
| packs/arte_romana/images/peristilio.jpg | `5382159d6380a686…` | 71 KB | no | sì | Estratta dalle dispense "Arte romana repubblicana" e "Arte romana imperiale" usate in classe (LEGGIMI v3) | non documentata | DA VERIFICARE |
| packs/arte_romana/images/pont_gard.jpg | `de9c2525be0d09c6…` | 88 KB | no | sì | Estratta dalle dispense "Arte romana repubblicana" e "Arte romana imperiale" usate in classe (LEGGIMI v3) | non documentata | DA VERIFICARE |
| packs/arte_romana/images/segovia.jpg | `7424182a921e087d…` | 106 KB | no | sì | Estratta dalle dispense "Arte romana repubblicana" e "Arte romana imperiale" usate in classe (LEGGIMI v3) | non documentata | DA VERIFICARE |
| packs/arte_romana/images/traiana.jpg | `331e32a11a93b14b…` | 97 KB | no | sì | Estratta dalle dispense "Arte romana repubblicana" e "Arte romana imperiale" usate in classe (LEGGIMI v3) | non documentata | DA VERIFICARE |
| packs/arte_romana/images/via_appia.jpg | `b0dbfe1934c940e1…` | 47 KB | no | sì | Estratta dalle dispense "Arte romana repubblicana" e "Arte romana imperiale" usate in classe (LEGGIMI v3) | non documentata | DA VERIFICARE |
| packs/arte_romana/images/volta.jpg | `e8a4bb8f40c90973…` | 63 KB | no | sì | Estratta dalle dispense "Arte romana repubblicana" e "Arte romana imperiale" usate in classe (LEGGIMI v3) | non documentata | DA VERIFICARE |
| PACK_ESEMPI/vulcani/images/cratere.png | `63e21466e015eff0…` | 10 KB | no | no | Disegni schematici generati per il pacchetto di esempio (v3.5) | CC0 | OK |
| PACK_ESEMPI/vulcani/images/etna.png | `f6800699aa40515d…` | 10 KB | no | no | Disegni schematici generati per il pacchetto di esempio (v3.5) | CC0 | OK |
| PACK_ESEMPI/vulcani/images/stromboli.png | `a9af00c27a9438b3…` | 10 KB | no | no | Disegni schematici generati per il pacchetto di esempio (v3.5) | CC0 | OK |
| PACK_ESEMPI/vulcani/images/vesuvio.png | `5895d6b161e52d48…` | 10 KB | no | no | Disegni schematici generati per il pacchetto di esempio (v3.5) | CC0 | OK |

## Mascotte animata (v3.5.4)

Fornite dal committente in `SECCHIONE_MASCOT_ANIMATED_ASSETS_FOR_CLAUDE.zip` (SHA-256 `5635662259368b30…`) e usate senza modifiche. Licenza e autore: da documentare a cura del committente, come per la mascotte originale.

| File | SHA-256 | Dimensioni | Uso |
|---|---|---|---|
| assets/mascot/mascot_present.webp | `dee2612aadf44880…` | 768×1024, 129 KB | runtime (welcome, reveal, point, host…) |
| assets/mascot/mascot_think.webp | `1538c4b138d532a0…` | 768×1024, 113 KB | runtime (think, explorer) |
| assets/mascot/mascot_celebrate.webp | `1c3d681c4fa170a6…` | 768×1024, 143 KB | runtime (celebrate, champion) |
| assets/mascot/mascot_panic.webp | `416d7f8017ae389d…` | 768×1024, 148 KB | runtime (panic: tempo scaduto) |
| assets/sorgenti_grafiche/mascotte_animata/*.png | — | 4 PNG master, 4,0 MB | solo sorgenti, non pubblicati in rete |

`assets/mascot/secchione_a.png` e `secchione_b.png` restano per l'anteprima di Pack Studio (non modificata in questa patch).
