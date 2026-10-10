#!/usr/bin/env node
/*
 * Genera ASSET_AUDIT.md: per ogni asset nome, hash SHA-256, dimensione, duplicato sì/no, origine e licenza note, stato.
 *   node tools/asset_audit.js
 * Le origini/licenze NON vengono inventate: senza documentazione lo stato è "DA VERIFICARE".
 */
'use strict';
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var ROOT = path.join(__dirname, '..');
var SCAN = ['assets', 'packs', 'PACK_ESEMPI'];
var EXT = /\.(png|jpe?g|webp|gif|svg|wav|mp3|m4a|ogg)$/i;

/* Unica fonte delle informazioni note. Tutto ciò che non è qui resta DA VERIFICARE. */
var KNOWN = [
  { re: /^packs\/arte_romana\/images\//, origin: 'Estratta dalle dispense "Arte romana repubblicana" e "Arte romana imperiale" usate in classe (LEGGIMI v3)', license: 'non documentata', status: 'DA VERIFICARE' },
  { re: /^assets\/mascot\//, origin: 'Mascotte del progetto (fornita con la v3); autore e strumento di creazione non documentati', license: 'non documentata', status: 'DA VERIFICARE' },
  { re: /^assets\/logo_clean\.svg$/, origin: 'Logo del progetto (fornito con la v3)', license: 'non documentata', status: 'DA VERIFICARE' },
  { re: /^assets\/sorgenti_grafiche\//, origin: 'Sorgenti grafiche del logo (v3), non usate dall\'app', license: 'non documentata', status: 'DA VERIFICARE' },
  { re: /^PACK_ESEMPI\/vulcani\/images\//, origin: 'Disegni schematici generati per il pacchetto di esempio (v3.5)', license: 'CC0', status: 'OK' },
  { re: /^assets\/brand\/logo_v2/, origin: 'Logo V2 (redesign RC1.5): disegno vettoriale del progetto generato da tools/brand/make_logo.py; lettere dai contorni di Barlow Condensed', license: 'SIL OFL 1.1 per i contorni del carattere (assets/fonts/OFL_BarlowCondensed.txt)', status: 'OK' },
  { re: /^assets\/sounds_hq\//, origin: 'Effetti sonori forniti con la v3; provenienza non documentata', license: 'non documentata', status: 'DA VERIFICARE' }
];

/* Mascotte v3: 12 nomi, 2 contenuti (verificato con SHA-256 sullo ZIP originale). */
var V3_MASCOT = [
  ['artist.png', 'd52ffb11234f505c', 'secchione_a.png'], ['explorer.png', 'd52ffb11234f505c', 'secchione_a.png'], ['host.png', 'd52ffb11234f505c', 'secchione_a.png'],
  ['idle.png', 'd52ffb11234f505c', '(non usato)'], ['jump.png', 'd52ffb11234f505c', '(non usato)'], ['present.png', 'd52ffb11234f505c', 'secchione_a.png'],
  ['scholar.png', 'd52ffb11234f505c', '(non usato)'], ['champion.png', 'fc78b7eebc53f7b5', 'secchione_b.png'], ['point.png', 'fc78b7eebc53f7b5', 'secchione_b.png'],
  ['scientist.png', 'fc78b7eebc53f7b5', 'secchione_b.png'], ['thumb.png', 'fc78b7eebc53f7b5', 'secchione_b.png'], ['walk.png', 'fc78b7eebc53f7b5', '(non usato)']
];

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir).forEach(function (f) {
    var p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (EXT.test(f)) out.push(p);
  });
  return out;
}

function referencedNames() {
  var text = ['index.html', 'show.html', 'player.html', 'js/app.js', 'js/show-client.js', 'css/show.css', 'css/classroom.css'].map(function (f) {
    var p = path.join(ROOT, f);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  }).join('\n');
  try { text += fs.readFileSync(path.join(ROOT, 'packs', 'packs.bundle.js'), 'utf8'); } catch (e) { /* ignore */ }
  return text;
}

function kb(n) { return (n / 1024).toFixed(0) + ' KB'; }

function main() {
  var files = [];
  SCAN.forEach(function (d) { walk(path.join(ROOT, d), files); });
  var refs = referencedNames();
  var rows = files.map(function (p) {
    var rel = path.relative(ROOT, p).replace(/\\/g, '/');
    var buf = fs.readFileSync(p);
    var info = KNOWN.filter(function (k) { return k.re.test(rel); })[0] || { origin: 'non documentata', license: 'non documentata', status: 'DA VERIFICARE' };
    var base = path.basename(rel);
    var used = refs.indexOf(base) >= 0 || refs.indexOf(rel) >= 0;
    return { rel: rel, hash: crypto.createHash('sha256').update(buf).digest('hex'), size: buf.length, info: info, used: used };
  });
  var byHash = {};
  rows.forEach(function (r) { (byHash[r.hash] = byHash[r.hash] || []).push(r.rel); });
  var total = rows.reduce(function (a, r) { return a + r.size; }, 0);
  var dupCount = rows.filter(function (r) { return byHash[r.hash].length > 1; }).length;
  var L = [];
  L.push('# ASSET_AUDIT — Il Secchione v3.5 CLASSROOM');
  L.push('');
  L.push('Generato da `node tools/asset_audit.js` il ' + new Date().toISOString().slice(0, 10) + '. ' + rows.length + ' file, ' + (total / 1048576).toFixed(1) + ' MB, ' + dupCount + ' file con contenuto duplicato.');
  L.push('');
  L.push('**Licenze:** nessuna licenza è stata inventata. Dove origine o licenza non sono documentate lo stato è `DA VERIFICARE`.');
  L.push('Prima di qualsiasi distribuzione al di fuori della propria classe, o di una commercializzazione, ogni riga `DA VERIFICARE` va chiarita (autore, permesso, licenza) oppure l\'asset va sostituito.');
  L.push('');
  L.push('## Deduplicazione rispetto alla v3');
  L.push('');
  L.push('Nella v3 c\'erano 12 PNG della mascotte (941×1670, circa 1,1 MB ciascuno, 13,3 MB in tutto) ma **solo 2 contenuti distinti**: la stessa figura nelle due direzioni. In v3.5 ci sono 2 file 620×1100, ridimensionati in alta qualità e sufficienti fino a un proiettore 1080p a tutto schermo. La mappa delle pose è in `js/app.js` (`MASCOT_POSES`, `MOOD_SRC`).');
  L.push('');
  L.push('| File v3 | Hash v3 (prefisso) | File v3.5 |');
  L.push('|---|---|---|');
  V3_MASCOT.forEach(function (m) { L.push('| assets/mascot/' + m[0] + ' | `' + m[1] + '` | ' + m[2] + ' |'); });
  L.push('');
  L.push('Altri file della v3 non referenziati dall\'app sono stati spostati o segnalati:');
  L.push('- `assets/logo.png` e `assets/logo_clean.png` sono stati spostati in `assets/sorgenti_grafiche/`: non vengono caricati dall\'app e restano disponibili per la stampa.');
  L.push('- `immagini/romana/cesare.jpg`, ora `packs/arte_romana/images/cesare.jpg`, non è usata da nessuna domanda o manche. È disponibile per l\'editor.');
  L.push('');
  L.push('## Audio: scelta del formato');
  L.push('');
  L.push('I 23 effetti restano in **WAV** (8,3 MB). Il motivo è che l\'audio è riprodotto solo dalla regia sul PC del docente: i tablet non scaricano mai l\'audio e il palco remoto `/show` è muto, quindi la dimensione non pesa sulla rete. Il WAV si riproduce senza decodifica in Chrome, Edge, Firefox e Safari/iPad.');
  L.push('Sul PC di sviluppo non era disponibile un encoder (ffmpeg). Una conversione in MP3 o AAC ridurrebbe circa 7 MB senza un vantaggio pratico in classe, quindi non è stata fatta, coerentemente con il principio "stabilità prima di pochi MB". Se in futuro servirà un pacchetto più leggero: MP3 a 128 kbps è il formato più compatibile, e basta cambiare le estensioni nella costante `SOUND` di `js/app.js`.');
  L.push('');
  L.push('## Elenco completo');
  L.push('');
  L.push('| File | SHA-256 | Dimensione | Duplicato | Usato dall\'app | Origine nota | Licenza nota | Stato |');
  L.push('|---|---|---|---|---|---|---|---|');
  rows.forEach(function (r) {
    var dup = byHash[r.hash].length > 1 ? 'SÌ (' + byHash[r.hash].filter(function (x) { return x !== r.rel; }).join(', ') + ')' : 'no';
    L.push('| ' + r.rel + ' | `' + r.hash.slice(0, 16) + '…` | ' + kb(r.size) + ' | ' + dup + ' | ' + (r.used ? 'sì' : 'no') + ' | ' + r.info.origin + ' | ' + r.info.license + ' | ' + r.info.status + ' |');
  });
  L.push('');
  fs.writeFileSync(path.join(ROOT, 'ASSET_AUDIT.md'), L.join('\n'));
  console.log('ASSET_AUDIT.md: ' + rows.length + ' file, ' + dupCount + ' duplicati, ' + (total / 1048576).toFixed(1) + ' MB');
}

main();
