'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var test = require('./harness.js').test;
var PE = require('../js/engine/packs.js');
var bp = require('../tools/build_packs.js');

var ROOT = path.join(__dirname, '..');
function json(rel) { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
function romanaRuntime() { var r = PE.validatePack(bp.loadPackFolder(path.join(ROOT, 'packs', 'arte_romana'))); return PE.toRuntime(r.pack); }

test('pack installato arte_romana valido: 72 domande, 33 manche (14/8/3/4/4)', function () {
  var r = PE.validatePack(bp.loadPackFolder(path.join(ROOT, 'packs', 'arte_romana')));
  assert.strictEqual(r.ok, true, r.errors.join('; '));
  assert.strictEqual(r.pack.questions.length, 72);
  var g = r.pack.games;
  assert.deepStrictEqual([g.photopuzzle.length, g.indovina.length, g.abbinamenti.length, g.ghigliottina.length, g.chain.length], [14, 8, 3, 4, 4]);
  var rt = PE.toRuntime(r.pack);
  assert.strictEqual(rt.gameNames.ghigliottina, 'Parola Segreta');
  assert.strictEqual(rt.imageBase, 'packs/arte_romana/images/');
});

test('ogni immagine citata dal pack esiste davvero su disco', function () {
  var r = PE.validatePack(bp.loadPackFolder(path.join(ROOT, 'packs', 'arte_romana')));
  var names = {};
  r.pack.questions.forEach(function (q) { if (q.image) names[q.image] = true; });
  r.pack.games.photopuzzle.forEach(function (s) { names[s.image] = true; });
  r.pack.games.abbinamenti.forEach(function (s) { s.cards.forEach(function (c) { names[c.img] = true; }); });
  names[r.pack.theme.homeImage] = true;
  Object.keys(names).forEach(function (n) { assert.ok(fs.existsSync(path.join(ROOT, 'packs', 'arte_romana', 'images', n)), 'manca ' + n); });
});

test('import v3: domande_romana.json valido, prefissi immagine tolti, id conservati', function () {
  var rt = romanaRuntime();
  var res = PE.importV3Questions(json('legacy_v3/domande_romana.json'), rt);
  assert.deepStrictEqual(res.errors, []);
  assert.strictEqual(res.questions.length, 72);
  assert.strictEqual(res.questions[0].id, 'rom001');
  assert.ok(res.questions.every(function (q) { return q.image.indexOf('romana/') !== 0; }));
  assert.ok(res.questions.every(function (q) { return q.points === undefined; }), 'il valore in punti non appartiene alla domanda');
});

test('import v3: giochi_romana.json valido (Indovina, Ghigliottina, Catena)', function () {
  var res = PE.importV3Games(json('legacy_v3/giochi_romana.json'), romanaRuntime());
  assert.deepStrictEqual(res.errors, []);
  assert.deepStrictEqual([res.games.indovina.length, res.games.ghigliottina.length, res.games.chain.length], [8, 4, 4]);
});

test('PACK_TEMPLATE valido; le bozze non entrano in gara', function () {
  var r = PE.validatePack(bp.loadPackFolder(path.join(ROOT, 'PACK_TEMPLATE')));
  assert.strictEqual(r.ok, true, r.errors.join('; '));
  assert.strictEqual(r.pack.questions.length, 5);
  assert.strictEqual(PE.toRuntime(r.pack).questions.length, 4);
  assert.ok(r.warnings.some(function (w) { return /bozza/.test(w); }));
});

function base() {
  var r = PE.validatePack(bp.loadPackFolder(path.join(ROOT, 'PACK_TEMPLATE')));
  return JSON.parse(JSON.stringify(r.pack));
}

test('pack non valido rifiutato con messaggi comprensibili', function () {
  var p = base(); delete p.format;
  assert.ok(PE.validatePack(p).errors.some(function (e) { return /format/.test(e); }));
  p = base(); p.id = 'Con Spazi';
  assert.ok(PE.validatePack(p).errors.some(function (e) { return /"id"/.test(e); }));
  p = base(); p.questions[1].id = p.questions[0].id;
  assert.ok(PE.validatePack(p).errors.some(function (e) { return /duplicato/.test(e); }));
  p = base(); p.questions[0].correct = 'E';
  assert.ok(PE.validatePack(p).errors.some(function (e) { return /domanda 1: "correct"/.test(e); }));
  p = base(); p.questions[0].options = ['a', 'b', 'c'];
  assert.ok(PE.validatePack(p).errors.some(function (e) { return /4 alternative/.test(e); }));
  p = base(); p.questions[0].options = ['a', 'b', 'c', 'A'];
  assert.ok(PE.validatePack(p).errors.some(function (e) { return /diverse/.test(e); }));
  p = base(); p.questions[0].type = 'numeric';
  assert.ok(PE.validatePack(p).errors.some(function (e) { return /previsto ma non ancora giocabile/.test(e); }));
  p = base(); p.questions[0].image = 'https://example.com/a.jpg';
  assert.ok(PE.validatePack(p).errors.some(function (e) { return /locali/.test(e); }));
  p = base(); p.questions[0].image = '../../segreto.jpg';
  assert.ok(PE.validatePack(p).errors.some(function (e) { return /\.\./.test(e); }));
  p = base(); p.games.ghigliottina[0].pairs.pop();
  assert.ok(PE.validatePack(p).errors.some(function (e) { return /5 coppie/.test(e); }));
  p = base(); p.games.nuovoGioco = [];
  assert.ok(PE.validatePack(p).errors.some(function (e) { return /sconosciuto/.test(e); }));
});

test('archivio domande non valido (v3) rifiutato per intero', function () {
  var data = json('legacy_v3/domande_romana.json');
  data[10].options = ['solo una'];
  var res = PE.importV3Questions(data, romanaRuntime());
  assert.ok(res.errors.length > 0);
});

test('durata: i secondi della domanda sono conservati (5–600) e 30 di default', function () {
  var q = PE.normalizeQuestion({ id: 'x', question: 'Q?', options: ['a', 'b', 'c', 'd'], correct: 'A', seconds: 60 }, 0, {});
  assert.strictEqual(q.seconds, 60);
  assert.strictEqual(PE.normalizeQuestion({ id: 'y', question: 'Q?', options: ['a', 'b', 'c', 'd'], correct: 'A' }, 0, {}).seconds, 30);
  assert.strictEqual(PE.normalizeQuestion({ id: 'z', question: 'Q?', options: ['a', 'b', 'c', 'd'], correct: 'A', seconds: 2 }, 0, {}).seconds, 5);
});

test('il bundle generato contiene il pack ed è aggiornato', function () {
  var c = bp.collect();
  assert.ok(c.report.every(function (r) { return r.ok; }), JSON.stringify(c.report));
  var src = fs.readFileSync(bp.BUNDLE, 'utf8');
  var root = {};
  new Function('self', src)(root);
  assert.strictEqual(root.SECCHIONE_PACK_SOURCES[0].id, 'arte_romana');
});
