#!/usr/bin/env node
/*
 * Converte un'edizione v3 (cartella con js/packs.js e immagini/<chiave>/) in un pack v3.5:
 *   packs/<id>/pack.json, questions.json, games.json, images/
 *
 * Uso:
 *   node tools/convert_v3_pack.js <cartella_v3> <id_pack> [--subject "Arte e immagine"] [--grade 2] [--force]
 * Esempio:
 *   node tools/convert_v3_pack.js ..\Il_Secchione_PREISTORIA_v3.0 preistoria --grade 1
 *
 * Non modifica la cartella v3. Dopo la conversione esegui: node tools/build_packs.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var PackEngine = require('../js/engine/packs.js');

function arg(name, fb) {
  var i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fb;
}
function mkdirp(dir) {
  if (fs.existsSync(dir)) return;
  mkdirp(path.dirname(dir));
  fs.mkdirSync(dir);
}

function loadV3Packs(v3dir) {
  var file = path.join(v3dir, 'js', 'packs.js');
  if (!fs.existsSync(file)) throw new Error('Non trovo ' + file);
  var src = fs.readFileSync(file, 'utf8');
  var fakeRoot = {};
  /* packs.js v3 è un IIFE che scrive root.SECCHIONE_PACKS: lo eseguiamo in un contesto isolato */
  new Function('window', 'globalThis', 'module', src)(fakeRoot, fakeRoot, undefined);
  if (!fakeRoot.SECCHIONE_PACKS) throw new Error('packs.js non contiene SECCHIONE_PACKS');
  return fakeRoot.SECCHIONE_PACKS;
}

function convert(v3dir, id, opts) {
  var packs = loadV3Packs(v3dir);
  var keys = Object.keys(packs);
  var key = opts.key || keys[0];
  var p = packs[key];
  if (!p) throw new Error('Pack "' + key + '" non trovato. Disponibili: ' + keys.join(', '));
  var prefix = key + '/';
  var outDir = path.join(opts.packsDir, id);
  if (fs.existsSync(path.join(outDir, 'pack.json')) && !opts.force) throw new Error(outDir + ' esiste già (usa --force)');
  mkdirp(path.join(outDir, 'images'));

  var manifest = {
    format: 'secchione-pack',
    formatVersion: 1,
    id: id,
    title: p.title ? p.title.charAt(0) + p.title.slice(1).toLowerCase() : id,
    subtitle: p.subtitle || '',
    subject: opts.subject || 'Arte e immagine',
    grade: opts.grade ? Number(opts.grade) : null,
    gradeLabel: '',
    author: '',
    version: '3.5.0',
    description: 'Convertito automaticamente dalla v3 (' + path.basename(v3dir) + ').',
    language: 'it',
    license: 'DA VERIFICARE',
    files: { questions: 'questions.json', games: 'games.json', images: 'images/' },
    theme: { eyebrow: p.eyebrow || 'IL SECCHIONE', accent: p.accent, accent2: p.accent2, homeImage: String(p.homeImage || '').replace(prefix, ''), tags: p.tags || [] },
    texts: {},
    gameNames: {},
    legacy: { v3PackKey: key, imagePrefix: prefix, convertedFrom: path.basename(v3dir), convertedAt: new Date().toISOString() }
  };

  var topic = manifest.title;
  var questions = (p.questions || []).map(function (q) {
    var x = JSON.parse(JSON.stringify(q));
    if (x.image) x.image = String(x.image).replace(prefix, '');
    if (!x.subject) x.subject = manifest.subject;
    if (!x.topic) x.topic = topic;
    if (x.grade == null && manifest.grade) x.grade = manifest.grade;
    if (!x.status) x.status = 'approved';
    delete x.points;
    return x;
  });
  var games = { games: {} };
  Object.keys(p.arcadeSets || {}).forEach(function (t) {
    games.games[t] = p.arcadeSets[t].map(function (s) {
      var x = JSON.parse(JSON.stringify(s));
      if (x.image) x.image = String(x.image).replace(prefix, '');
      if (Array.isArray(x.cards)) x.cards.forEach(function (c) { if (c.img) c.img = String(c.img).replace(prefix, ''); });
      return x;
    });
  });

  // Validazione con il motore prima di scrivere
  var check = PackEngine.validatePack(Object.assign({}, manifest, { questions: questions, games: games }));
  if (!check.ok) throw new Error('Il pack convertito non è valido:\n - ' + check.errors.join('\n - '));

  // Immagini: copia tutte quelle della cartella immagini/<chiave>/
  var imgSrc = path.join(v3dir, 'immagini', key);
  var copied = 0;
  if (fs.existsSync(imgSrc)) {
    fs.readdirSync(imgSrc).forEach(function (f) {
      if (!/\.(jpe?g|png|webp|gif|svg)$/i.test(f)) return;
      fs.copyFileSync(path.join(imgSrc, f), path.join(outDir, 'images', f));
      copied++;
    });
  }
  fs.writeFileSync(path.join(outDir, 'pack.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'questions.json'), JSON.stringify(questions, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'games.json'), JSON.stringify(games, null, 2) + '\n');
  return { outDir: outDir, questions: questions.length, games: PackEngine.countGames(check.pack.games), images: copied, warnings: check.warnings };
}

if (require.main === module) {
  var v3dir = process.argv[2];
  var id = process.argv[3];
  if (!v3dir || !id) {
    console.log('Uso: node tools/convert_v3_pack.js <cartella_v3> <id_pack> [--subject "..."] [--grade N] [--key romana] [--force]');
    process.exit(1);
  }
  try {
    var r = convert(path.resolve(v3dir), id, {
      packsDir: path.join(__dirname, '..', 'packs'),
      subject: arg('--subject'),
      grade: arg('--grade'),
      key: arg('--key'),
      force: process.argv.indexOf('--force') > 0
    });
    console.log('Pack creato in ' + r.outDir);
    console.log('  domande: ' + r.questions + ' · manche: ' + r.games + ' · immagini: ' + r.images);
    r.warnings.forEach(function (w) { console.log('  avviso: ' + w); });
    console.log('Ora esegui: node tools/build_packs.js');
  } catch (e) {
    console.error('ERRORE: ' + e.message);
    process.exit(1);
  }
}

module.exports = { convert: convert, loadV3Packs: loadV3Packs };
