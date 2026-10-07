#!/usr/bin/env node
/*
 * Gestore Pacchetti da riga di comando (libreria locale = cartella packs/).
 *
 *   node tools/pack_manager.js import <file.zip|file.json> [altri…]   importa (un solo comando: dati, giochi e immagini)
 *   node tools/pack_manager.js list                                   elenco dei pacchetti installati
 *   node tools/pack_manager.js duplicate <id> [--id nuovo] [--title "Titolo"]
 *   node tools/pack_manager.js export <id> [file.zip]                 crea lo .zip del pacchetto
 *   node tools/pack_manager.js remove <id>                            sposta nel cestino (data/cestino_pacchetti)
 *   node tools/pack_manager.js zip <cartella> [file.zip]              crea uno .zip da una cartella sorgente (dopo averla validata)
 *   node tools/pack_manager.js migrate                                registra i pack già presenti (automatico all'avvio del server)
 *
 * Opzione --packs <cartella> per lavorare su una libreria diversa (test).
 * Funziona offline e non modifica mai un pacchetto già installato.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var PL = require('../js/engine/packlib.js');
var Z = require('../js/lib/zip.js');
var disk = require('../server/packstore-disk.js');

function arg(name, fb) { var i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fb; }
function positional() {
  var out = [];
  var skip = false;
  process.argv.slice(3).forEach(function (a) {
    if (skip) { skip = false; return; }
    if (/^--(id|title|packs)$/.test(a)) { skip = true; return; }
    out.push(a);
  });
  return out;
}

function library() {
  var packsDir = arg('--packs');
  return disk.diskLibrary(packsDir ? { packsDir: path.resolve(packsDir), trashDir: path.join(path.resolve(packsDir), '..', 'cestino_pacchetti') } : {});
}

function printResult(file, r) {
  if (r.action === 'installed') {
    console.log('✓ ' + path.basename(file) + ' → installato "' + r.summary.title + '" (id: ' + r.id + ')');
    if (r.renamedFrom) console.log('   esisteva già un pacchetto con id "' + r.renamedFrom + '": quello resta invariato, il nuovo è "' + r.id + '"');
    console.log('   ' + r.summary.questions + ' domande · ' + r.summary.games + ' manche · materia: ' + (r.summary.subject || '—') + ' · versione ' + r.summary.version);
  } else if (r.action === 'already-installed') {
    console.log('= ' + path.basename(file) + ': già installato (id: ' + r.id + '), nessuna modifica');
  } else {
    console.log('✗ ' + path.basename(file) + ': NON importato');
    r.errors.slice(0, 15).forEach(function (e) { console.log('   - ' + e); });
  }
  (r.warnings || []).slice(0, 8).forEach(function (w) { console.log('   ! ' + w); });
}

async function main() {
  var cmd = process.argv[2];
  var args = positional();
  var lib = library();
  if (cmd === 'import') {
    if (!args.length) throw new Error('indica il file .zip da importare');
    lib.disk.migrate();
    var failures = 0;
    for (var i = 0; i < args.length; i++) {
      var file = path.resolve(args[i]);
      var bytes = new Uint8Array(fs.readFileSync(file));
      var r = await lib.importFile(path.basename(file), bytes, { inflate: disk.inflate });
      printResult(file, r);
      if (!r.ok) failures++;
    }
    return failures ? 2 : 0;
  }
  if (cmd === 'list') {
    lib.disk.migrate();
    var list = await lib.list();
    list.forEach(function (p) {
      var s = p.summary;
      console.log((p.ok ? '  ' : '✗ ') + s.id.padEnd(22) + ' ' + String(s.title).padEnd(28) + ' ' + String(s.subject || '—').padEnd(18) + ' classe ' + (s.grade || '—') + '  v' + s.version + '  ' + s.questions + ' domande, ' + s.games + ' manche  [' + s.origin + ']');
      if (!p.ok) p.errors.slice(0, 3).forEach(function (e) { console.log('     - ' + e); });
    });
    return 0;
  }
  if (cmd === 'duplicate') {
    var d = await lib.duplicate(args[0], { newId: arg('--id'), title: arg('--title') });
    console.log(d.ok ? '✓ copia creata: ' + d.id + ' ("' + d.summary.title + '")' : '✗ ' + d.errors.join('; '));
    return d.ok ? 0 : 2;
  }
  if (cmd === 'export') {
    var e = await lib.exportZip(args[0]);
    if (!e.ok) { console.log('✗ ' + e.errors.join('; ')); return 2; }
    var out = path.resolve(args[1] || e.filename);
    fs.writeFileSync(out, Buffer.from(e.bytes));
    console.log('✓ esportato: ' + out + ' (' + Math.round(e.bytes.length / 1024) + ' KB)');
    e.warnings.forEach(function (w) { console.log('   ! ' + w); });
    return 0;
  }
  if (cmd === 'remove') {
    var rm = await lib.remove(args[0]);
    console.log(rm.ok ? '✓ "' + args[0] + '" spostato nel cestino (data/cestino_pacchetti): si può recuperare' : '✗ ' + rm.errors.join('; '));
    return rm.ok ? 0 : 2;
  }
  if (cmd === 'zip') {
    var folder = path.resolve(args[0] || '');
    var full = require('./build_packs.js').loadPackFolder(folder);
    var images = {};
    var imgDir = path.join(folder, 'images');
    if (fs.existsSync(imgDir)) fs.readdirSync(imgDir).forEach(function (f) { if (fs.statSync(path.join(imgDir, f)).isFile()) images[f] = new Uint8Array(fs.readFileSync(path.join(imgDir, f))); });
    delete full.imageBase;
    var checked = PL.validateImport({ full: full, images: images, warnings: [] });
    if (!checked.ok) { console.log('✗ la cartella non è un pacchetto valido:'); checked.errors.forEach(function (x) { console.log('   - ' + x); }); return 2; }
    var target = path.resolve(args[1] || path.join(path.dirname(folder), checked.pack.id + '.zip'));
    fs.writeFileSync(target, Buffer.from(Z.zip(PL.packFiles(checked.pack, checked.images))));
    console.log('✓ creato ' + target);
    checked.warnings.forEach(function (w) { console.log('   ! ' + w); });
    return 0;
  }
  if (cmd === 'migrate') {
    var done = lib.disk.migrate();
    console.log(done.length ? '✓ registrati: ' + done.join(', ') : 'nessun pacchetto da migrare');
    lib.disk.changed();
    return 0;
  }
  console.log('Uso: node tools/pack_manager.js import <file.zip> | list | duplicate <id> | export <id> [file.zip] | remove <id> | zip <cartella> | migrate');
  return 1;
}

main().then(function (code) { process.exitCode = code; }, function (e) { console.error('ERRORE: ' + e.message); process.exitCode = 1; });
