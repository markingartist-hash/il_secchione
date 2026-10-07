#!/usr/bin/env node
/*
 * Costruisce packs/packs.bundle.js a partire da packs/<id>/pack.json + questions.json + games.json.
 * Il bundle JS serve perché da file:// il browser non può leggere i JSON con fetch.
 *
 * Uso:
 *   node tools/build_packs.js              valida e ricostruisce il bundle
 *   node tools/build_packs.js --check      valida soltanto
 *   node tools/build_packs.js --export ID  crea anche packs/ID/ID.secchione.json (pack in un solo file, da importare dalla regia)
 *
 * Il server (server/server.js) lo esegue da solo all'avvio se un JSON è più recente del bundle.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var PackEngine = require('../js/engine/packs.js');

var ROOT = path.join(__dirname, '..');
var PACKS_DIR = path.join(ROOT, 'packs');
var BUNDLE = path.join(PACKS_DIR, 'packs.bundle.js');

function readJSON(file) {
  var raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  try { return JSON.parse(raw); } catch (e) { throw new Error(path.relative(ROOT, file) + ': JSON non valido (' + e.message + ')'); }
}

/** Carica un pack in formato cartella. Restituisce l'oggetto completo (manifest + questions + games). */
function loadPackFolder(dir) {
  var manifestFile = path.join(dir, 'pack.json');
  var m = readJSON(manifestFile);
  var files = m.files || {};
  var qFile = path.join(dir, files.questions || 'questions.json');
  var gFile = path.join(dir, files.games || 'games.json');
  var full = Object.assign({}, m);
  full.questions = fs.existsSync(qFile) ? readJSON(qFile) : [];
  full.games = fs.existsSync(gFile) ? readJSON(gFile) : {};
  if (!full.imageBase) full.imageBase = 'packs/' + path.basename(dir) + '/' + String(files.images || 'images/').replace(/^\.?\//, '');
  return full;
}

/* Cartelle che iniziano con . o _ sono ignorate (installazioni in corso, cestino, appunti). */
function packFolders(dir) {
  var base = dir || PACKS_DIR;
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base)
    .filter(function (d) { return !/^[._]/.test(d); })
    .map(function (d) { return path.join(base, d); })
    .filter(function (d) { return fs.statSync(d).isDirectory() && fs.existsSync(path.join(d, 'pack.json')); })
    .sort();
}

/** Valida tutti i pack. Restituisce {packs:[sorgenti valide], report:[...]} */
function collect(dir) {
  var report = [];
  var packs = [];
  var seen = {};
  packFolders(dir).forEach(function (dir) {
    var name = path.basename(dir);
    try {
      var full = loadPackFolder(dir);
      var res = PackEngine.validatePack(full);
      if (res.ok && res.pack.id !== name) res.errors.push('l\'id "' + res.pack.id + '" deve coincidere con il nome della cartella "' + name + '"');
      if (res.ok && seen[res.pack.id]) res.errors.push('id duplicato');
      var ok = res.errors.length === 0;
      report.push({ dir: name, ok: ok, errors: res.errors, warnings: res.warnings, questions: res.pack ? res.pack.questions.length : 0, games: res.pack ? PackEngine.countGames(res.pack.games) : 0 });
      if (ok) { seen[res.pack.id] = true; packs.push(res.pack); }
    } catch (e) {
      report.push({ dir: name, ok: false, errors: [e.message], warnings: [], questions: 0, games: 0 });
    }
  });
  return { packs: packs, report: report };
}

function bundleSource(packs) {
  return '/* GENERATO da tools/build_packs.js il ' + new Date().toISOString() + ' — non modificare a mano.\n' +
    '   Modifica i file in packs/<id>/ e riesegui lo strumento (oppure avvia il server, che lo rigenera). */\n' +
    '(function(root){var list=' + JSON.stringify(packs) + ';' +
    'root.SECCHIONE_PACK_SOURCES=(root.SECCHIONE_PACK_SOURCES||[]).concat(list);' +
    '})(typeof self!=="undefined"?self:this);\n';
}

function build(opts) {
  var o = opts || {};
  var bundle = o.bundle || (o.packsDir ? path.join(o.packsDir, 'packs.bundle.js') : BUNDLE);
  var c = collect(o.packsDir);
  fs.writeFileSync(bundle + '.tmp', bundleSource(c.packs));
  fs.renameSync(bundle + '.tmp', bundle);
  // il rename aggiorna la data della cartella: il bundle deve risultare più recente
  var now = new Date(Date.now() + 1000);
  try { fs.utimesSync(bundle, now, now); } catch (e) { /* ignore */ }
  return c;
}

/** true se un file JSON di un pack è più recente del bundle (o il bundle manca). */
function bundleIsStale() {
  if (!fs.existsSync(BUNDLE)) return true;
  var t = fs.statSync(BUNDLE).mtime.getTime();
  // pacchetti aggiunti, rinominati o eliminati cambiano la data della cartella packs/
  if (fs.statSync(PACKS_DIR).mtime.getTime() > t) return true;
  return packFolders().some(function (dir) {
    return fs.readdirSync(dir).some(function (f) {
      return /\.json$/i.test(f) && fs.statSync(path.join(dir, f)).mtime.getTime() > t;
    });
  });
}

function exportSingle(id) {
  var dir = path.join(PACKS_DIR, id);
  var full = loadPackFolder(dir);
  var res = PackEngine.validatePack(full);
  if (!res.ok) throw new Error('pack non valido: ' + res.errors.join('; '));
  var out = path.join(dir, id + '.secchione.json');
  fs.writeFileSync(out, JSON.stringify(res.pack, null, 2) + '\n');
  return out;
}

function printReport(report) {
  report.forEach(function (r) {
    console.log((r.ok ? '  OK   ' : '  ERR  ') + r.dir + (r.ok ? '  (' + r.questions + ' domande, ' + r.games + ' manche)' : ''));
    r.errors.forEach(function (e) { console.log('       ✗ ' + e); });
    r.warnings.forEach(function (w) { console.log('       ! ' + w); });
  });
}

if (require.main === module) {
  var check = process.argv.indexOf('--check') > 0;
  var ex = process.argv.indexOf('--export');
  try {
    var c = check ? collect() : build();
    console.log(check ? 'Verifica pack:' : 'Bundle scritto: ' + path.relative(ROOT, BUNDLE));
    printReport(c.report);
    if (ex > 0 && process.argv[ex + 1]) console.log('Pack in file singolo: ' + path.relative(ROOT, exportSingle(process.argv[ex + 1])));
    process.exit(c.report.every(function (r) { return r.ok; }) ? 0 : 2);
  } catch (e) {
    console.error('ERRORE: ' + e.message);
    process.exit(1);
  }
}

module.exports = { PACKS_DIR: PACKS_DIR, packFolders: packFolders, build: build, collect: collect, bundleIsStale: bundleIsStale, loadPackFolder: loadPackFolder, exportSingle: exportSingle, BUNDLE: BUNDLE };
