'use strict';
/* Gestore Pacchetti: zip, importazione, collisioni, duplicazione, esportazione, eliminazione, sessioni con più pack. */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var zlib = require('zlib');
var crypto = require('crypto');
var childProcess = require('child_process');
var test = require('./harness.js').test;
var Z = require('../js/lib/zip.js');
var PL = require('../js/engine/packlib.js');
var PE = require('../js/engine/packs.js');
var SS = require('../js/engine/session.js');
var disk = require('../server/packstore-disk.js');
var H = require('./helpers.js');

var ROOT = path.join(__dirname, '..');
function bytes(rel) { return new Uint8Array(fs.readFileSync(path.join(ROOT, rel))); }
var VULCANI = function () { return bytes('PACK_ESEMPI/vulcani.zip'); };
var INGLESE = function () { return bytes('PACK_ESEMPI/inglese_base.zip'); };
function memLib() { return new PL.PackLibrary([PL.memoryAdapter('browser')]); }
function tempLib() {
  var dir = H.tempDir();
  var packsDir = path.join(dir, 'packs');
  fs.mkdirSync(packsDir);
  var lib = disk.diskLibrary({ packsDir: packsDir, trashDir: path.join(dir, 'cestino') });
  lib.dir = dir;
  lib.packsDir = packsDir;
  return lib;
}
/** Ricostruisce uno zip modificando i file con una funzione (nome, byte) → byte | null per toglierlo. */
function rezip(zipBytes, edit) {
  var files = Z.unzip(zipBytes);
  var out = [];
  Object.keys(files).forEach(function (n) { var d = edit(n, files[n]); if (d) out.push({ name: n, data: d }); });
  return Z.zip(out);
}
function editJSON(zipBytes, suffix, fn) {
  return rezip(zipBytes, function (n, d) {
    if (n.slice(-suffix.length) !== suffix) return d;
    var o = JSON.parse(Z.utf8Decode(d));
    var r = fn(o);
    return Z.utf8Encode(JSON.stringify(r === undefined ? o : r));
  });
}

/* ---------------- zip ---------------- */
test('zip: CRC-32 di riferimento e andata/ritorno con nomi UTF-8', function () {
  assert.strictEqual(Z.crc32(Buffer.from('123456789')), 0xCBF43926);
  var z = Z.zip([{ name: 'cartella/città.json', data: '{"a":"àèìòù"}' }, { name: 'cartella/images/x.bin', data: new Uint8Array([0, 1, 2, 255]) }]);
  var f = Z.unzip(z);
  assert.deepStrictEqual(Object.keys(f), ['cartella/città.json', 'cartella/images/x.bin']);
  assert.strictEqual(Z.utf8Decode(f['cartella/città.json']), '{"a":"àèìòù"}');
});

test('zip: la decompressione JavaScript (usata nel browser) coincide con zlib', function () {
  var data = [crypto.randomBytes(70000), Buffer.from(fs.readFileSync(path.join(ROOT, 'packs/arte_romana/questions.json'))), fs.readFileSync(path.join(ROOT, 'packs/arte_romana/images/colosseo.jpg')), Buffer.alloc(50000)];
  data.forEach(function (d) {
    [1, 6, 9].forEach(function (level) {
      var out = Z.inflateRaw(new Uint8Array(zlib.deflateRawSync(d, { level: level })), d.length);
      assert.ok(Buffer.compare(Buffer.from(out), d) === 0, 'livello ' + level);
    });
  });
});

test('zip: legge uno .zip creato con "Comprimi" di Windows (Compress-Archive)', function () {
  var f = Z.unzip(bytes('tests/fixtures/inglese_base_windows.zip'));
  assert.ok(Object.keys(f).some(function (n) { return /pack\.json$/.test(n); }), Object.keys(f).join(','));
});

test('zip: file non zip, troncato o danneggiato → errore chiaro', function () {
  assert.throws(function () { Z.unzip(new Uint8Array([1, 2, 3])); }, /non è un file \.zip valido/);
  var z = VULCANI();
  assert.throws(function () { Z.unzip(z.subarray(0, z.length - 30)); }, /zip/);
  var broken = new Uint8Array(z);
  broken[200] ^= 0xFF;
  assert.throws(function () { Z.unzip(broken); }, /CRC|danneggiat/);
});

/* ---------------- importazione ---------------- */
test('importazione: un solo file .zip porta domande, giochi e immagini (libreria del browser)', async function () {
  var lib = memLib();
  var r = await lib.importFile('vulcani.zip', VULCANI());
  assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
  assert.strictEqual(r.action, 'installed');
  assert.strictEqual(r.summary.questions, 6);
  assert.strictEqual(r.summary.games, 4);
  assert.deepStrictEqual(r.summary.gamesByType, { photopuzzle: 1, indovina: 1, abbinamenti: 1, ghigliottina: 0, chain: 1 });
  var imgs = await lib.adapters[0].readImages('vulcani');
  assert.deepStrictEqual(Object.keys(imgs).sort(), ['cratere.png', 'etna.png', 'stromboli.png', 'vesuvio.png']);
  var list = await lib.list();
  assert.strictEqual(list[0].summary.subject, 'Scienze');
  assert.strictEqual(list[0].summary.grade, 2);
});

test('importazione su disco: cartella packs/<id> completa, install.json, bundle aggiornato', async function () {
  var lib = tempLib();
  try {
    var r = await lib.importFile('vulcani.zip', VULCANI(), { inflate: disk.inflate });
    assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
    var dir = path.join(lib.packsDir, 'vulcani');
    ['pack.json', 'questions.json', 'games.json', 'install.json', 'images/etna.png'].forEach(function (f) { assert.ok(fs.existsSync(path.join(dir, f)), f); });
    assert.ok(Buffer.compare(fs.readFileSync(path.join(dir, 'images/etna.png')), fs.readFileSync(path.join(ROOT, 'PACK_ESEMPI/vulcani/images/etna.png'))) === 0, 'immagine identica');
    var bundle = fs.readFileSync(path.join(lib.packsDir, 'packs.bundle.js'), 'utf8');
    assert.ok(bundle.indexOf('"id":"vulcani"') > 0, 'il bundle (per file://) contiene il nuovo pack');
    assert.ok(!fs.readdirSync(lib.packsDir).some(function (d) { return /^\.tmp-/.test(d); }), 'nessuna cartella temporanea rimasta');
  } finally { H.rmrf(lib.dir); }
});

test('comando unico: node tools/pack_manager.js import <file.zip> (anche più file)', function () {
  var lib = tempLib();
  try {
    var out = childProcess.execFileSync(process.execPath, [path.join(ROOT, 'tools/pack_manager.js'), 'import', path.join(ROOT, 'PACK_ESEMPI/vulcani.zip'), path.join(ROOT, 'PACK_ESEMPI/inglese_base.zip'), '--packs', lib.packsDir], { encoding: 'utf8' });
    assert.ok(/installato "Vulcani"/.test(out) && /installato "Inglese di base"/.test(out), out);
    assert.ok(fs.existsSync(path.join(lib.packsDir, 'inglese_base', 'pack.json')));
  } finally { H.rmrf(lib.dir); }
});

test('importazione di un pack in file singolo .json con immagini incorporate', async function () {
  var lib = memLib();
  var png = fs.readFileSync(path.join(ROOT, 'PACK_ESEMPI/vulcani/images/etna.png')).toString('base64');
  var single = { format: 'secchione-pack', formatVersion: 1, id: 'singolo', title: 'Singolo', version: '1.0.0', questions: [{ id: 'a', question: 'Q?', options: ['1', '2', '3', '4'], correct: 'B', image: 'data:image/png;base64,' + png }], games: {} };
  var r = await lib.importFile('singolo.json', Z.utf8Encode(JSON.stringify(single)));
  assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
  var stored = (await lib.list())[0].pack;
  assert.strictEqual(stored.questions[0].image, 'incorporata-1.png');
  assert.ok((await lib.adapters[0].readImages('singolo'))['incorporata-1.png'].length > 1000);
});

test('migrazione automatica: uno .zip di un\'edizione v3 viene convertito al volo', async function () {
  var packsJs = '(function(root){const PACKS=' + JSON.stringify({ storia: { key: 'storia', title: 'STORIA ANTICA', subtitle: 'Prova', homeImage: 'storia/a.png', accent: '#ffffff', accent2: '#000000', tags: ['x'], questions: [{ id: 's1', category: 'C', question: 'Domanda?', options: ['a', 'b', 'c', 'd'], correct: 'A', seconds: 30, points: 300, image: 'storia/a.png' }], arcadeSets: { photopuzzle: [{ label: 'P1', image: 'storia/a.png', answer: 'Risposta' }], chain: [{ label: 'C1', theme: 'T', links: [{ from: 'A', to: 'B' }], seconds: 30 }] }, gameNames: {} } }) + ';root.SECCHIONE_PACKS=PACKS;})(this);';
  var png = new Uint8Array(fs.readFileSync(path.join(ROOT, 'PACK_ESEMPI/vulcani/images/etna.png')));
  var v3 = Z.zip([{ name: 'Il_Secchione_STORIA_v3.0/js/packs.js', data: packsJs }, { name: 'Il_Secchione_STORIA_v3.0/immagini/storia/a.png', data: png }, { name: 'Il_Secchione_STORIA_v3.0/index.html', data: '<html>' }]);
  var lib = memLib();
  var r = await lib.importFile('Il_Secchione_STORIA_v3.0.zip', v3);
  assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
  assert.strictEqual(r.id, 'storia_antica');
  assert.strictEqual(r.summary.origin, 'convertito-v3');
  var p = (await lib.list())[0].pack;
  assert.strictEqual(p.questions[0].image, 'a.png', 'prefisso v3 tolto');
  assert.strictEqual(p.questions[0].points, undefined);
  assert.strictEqual(p.games.photopuzzle[0].image, 'a.png');
  assert.ok(r.warnings.some(function (w) { return /v3/.test(w); }));
});

test('migrazione automatica su disco: i pack già presenti (es. Arte romana) vengono registrati', function () {
  var lib = tempLib();
  try {
    copyDir(path.join(ROOT, 'packs/arte_romana'), path.join(lib.packsDir, 'arte_romana'));
    try { fs.unlinkSync(path.join(lib.packsDir, 'arte_romana', 'install.json')); } catch (e) { /* assente */ }
    var done = lib.disk.migrate();
    assert.deepStrictEqual(done, ['arte_romana']);
    var meta = JSON.parse(fs.readFileSync(path.join(lib.packsDir, 'arte_romana', 'install.json'), 'utf8'));
    assert.strictEqual(meta.origin, 'migrato-v3');
    assert.ok(/^fp-/.test(meta.fingerprint));
    assert.deepStrictEqual(lib.disk.migrate(), [], 'la seconda volta non fa nulla');
  } finally { H.rmrf(lib.dir); }
});

function copyDir(a, b) {
  fs.mkdirSync(b);
  fs.readdirSync(a).forEach(function (f) {
    var s = path.join(a, f);
    if (fs.statSync(s).isDirectory()) copyDir(s, path.join(b, f)); else fs.writeFileSync(path.join(b, f), fs.readFileSync(s));
  });
}

test('pacchetti non validi rifiutati senza scrivere nulla', async function () {
  var lib = tempLib();
  try {
    var cases = [
      ['senza pack.json', rezip(VULCANI(), function (n, d) { return /pack\.json$/.test(n) ? null : d; }), /pack\.json/],
      ['domanda con 3 alternative', editJSON(VULCANI(), 'questions.json', function (q) { q[0].options.pop(); }), /4 alternative/],
      ['risposta corretta non valida', editJSON(VULCANI(), 'questions.json', function (q) { q[1].correct = 'E'; }), /correct/],
      ['immagine citata ma mancante', rezip(VULCANI(), function (n, d) { return /etna\.png$/.test(n) ? null : d; }), /immagine mancante: "etna\.png"/],
      ['percorso pericoloso (zip slip)', Z.zip([{ name: 'vulcani/pack.json', data: Z.unzip(VULCANI())['vulcani/pack.json'] }, { name: '../../evil.txt', data: 'x' }]), /percorso non consentito/],
      ['immagine SVG', Z.zip(Object.keys(Z.unzip(VULCANI())).map(function (n) { return { name: n, data: Z.unzip(VULCANI())[n] }; }).concat([{ name: 'vulcani/images/logo.svg', data: '<svg onload="alert(1)"/>' }])), /SVG/],
      ['file .png che non è un\'immagine', rezip(VULCANI(), function (n, d) { return /cratere\.png$/.test(n) ? Z.utf8Encode('non sono un png, sono testo') : d; }), /non è un'immagine PNG valida/],
      ['file qualsiasi', new Uint8Array(crypto.randomBytes(500)), /né un \.zip/]
    ];
    for (var i = 0; i < cases.length; i++) {
      var r = await lib.importFile('test.zip', cases[i][1], { inflate: disk.inflate });
      assert.strictEqual(r.ok, false, cases[i][0]);
      assert.ok(r.errors.some(function (e) { return cases[i][2].test(e); }), cases[i][0] + ': ' + r.errors.join(' | '));
    }
    var left = fs.readdirSync(lib.packsDir).filter(function (d) { return d !== 'packs.bundle.js'; });
    assert.deepStrictEqual(left, [], 'nessuna cartella creata');
  } finally { H.rmrf(lib.dir); }
});

/* ---------------- collisioni ---------------- */
test('collisione di id: un pack diverso con lo stesso id riceve un nuovo id, l\'originale non cambia', async function () {
  var lib = tempLib();
  try {
    await lib.importFile('vulcani.zip', VULCANI(), { inflate: disk.inflate });
    var before = fs.readFileSync(path.join(lib.packsDir, 'vulcani', 'questions.json'), 'utf8');
    var changed = editJSON(VULCANI(), 'questions.json', function (q) { q[0].question = 'Domanda cambiata?'; });
    var r = await lib.importFile('vulcani_nuovo.zip', changed, { inflate: disk.inflate });
    assert.strictEqual(r.action, 'installed');
    assert.strictEqual(r.id, 'vulcani-2');
    assert.strictEqual(r.renamedFrom, 'vulcani');
    assert.strictEqual(fs.readFileSync(path.join(lib.packsDir, 'vulcani', 'questions.json'), 'utf8'), before, 'originale intatto');
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(lib.packsDir, 'vulcani-2', 'pack.json'), 'utf8')).id, 'vulcani-2');
    var r3 = await lib.importFile('vulcani_terzo.zip', editJSON(VULCANI(), 'questions.json', function (q) { q[0].question = 'Terza?'; }), { inflate: disk.inflate });
    assert.strictEqual(r3.id, 'vulcani-3');
  } finally { H.rmrf(lib.dir); }
});

test('stesso contenuto importato due volte: "già installato", nessuna copia', async function () {
  var lib = memLib();
  await lib.importFile('vulcani.zip', VULCANI());
  var again = await lib.importFile('vulcani (1).zip', VULCANI());
  assert.strictEqual(again.action, 'already-installed');
  assert.strictEqual(again.id, 'vulcani');
  assert.strictEqual((await lib.list()).length, 1);
});

test('collisione degli id delle domande tra pack diversi: nella sessione mista restano distinti', async function () {
  var lib = memLib();
  await lib.importFile('vulcani.zip', VULCANI());
  await lib.importFile('inglese_base.zip', INGLESE());
  var list = await lib.list();
  var rts = list.map(function (p) { return PE.toRuntime(p.pack); });
  var v = rts.filter(function (r) { return r.id === 'vulcani'; })[0];
  var e = rts.filter(function (r) { return r.id === 'inglese_base'; })[0];
  assert.strictEqual(v.questions[0].id, e.questions[0].id, 'entrambi usano "q001"');
  var bank = PL.composeBank([{ pack: v, questions: v.questions }, { pack: e, questions: e.questions }]);
  var ids = bank.map(function (q) { return q.id; });
  assert.strictEqual(new Set(ids).size, 12);
  assert.strictEqual(ids[0], 'vulcani/q001');
  assert.strictEqual(ids[6], 'inglese_base/q001');
  assert.strictEqual(bank[6].source.questionId, 'q001');
  assert.strictEqual(bank[6].source.subject, 'Lingua inglese');
  assert.strictEqual(bank[6].source.topic, 'Colours');
});

/* ---------------- attivazione, cambio pack, multi-pack ---------------- */
function runtimes() {
  var lib = memLib();
  return lib.importFile('v.zip', VULCANI()).then(function () { return lib.importFile('e.zip', INGLESE()); }).then(function () { return lib.list(); })
    .then(function (list) { var o = {}; list.forEach(function (p) { o[p.id] = PE.toRuntime(p.pack); }); return o; });
}

test('attivazione: la sessione registra pack, versione, materia e argomenti', async function () {
  var P = await runtimes();
  var s = SS.createSession({});
  PL.recordActivation(s, [P.vulcani]);
  assert.strictEqual(s.packId, 'vulcani');
  assert.strictEqual(s.packVersion, '1.0.0');
  assert.deepStrictEqual(s.activePacks, ['vulcani']);
  assert.strictEqual(s.packs[0].subject, 'Scienze');
  assert.deepStrictEqual(s.packs[0].topics.sort(), ['Rocce', 'Vulcani']);
});

test('cambio pack nella stessa sessione: squadre e storico restano, i pack usati si accumulano', async function () {
  var P = await runtimes();
  var s = SS.createSession({});
  s.participants = [{ id: 't1', name: '2A' }];
  PL.recordActivation(s, [P.vulcani]);
  s.responses.push(Object.assign(SS.makeResponse({ participantId: 't1', outcome: 'correct' }), PL.provenance(PL.composeBank([{ pack: P.vulcani, questions: P.vulcani.questions }])[0])));
  PL.recordActivation(s, [P.inglese_base]);
  PL.recordActivation(s, [P.vulcani]);
  assert.deepStrictEqual(s.packs.map(function (p) { return p.packId; }), ['vulcani', 'inglese_base'], 'nessun duplicato');
  assert.strictEqual(s.packId, 'vulcani');
  assert.strictEqual(s.participants.length, 1, 'le squadre non dipendono dal pack');
  assert.strictEqual(s.responses[0].packId, 'vulcani', 'la risposta conserva il pack di origine');
});

test('multi-pack: sessione mista con domande e giochi di più pack e provenienza per risposta', async function () {
  var P = await runtimes();
  var s = SS.createSession({});
  PL.recordActivation(s, [P.vulcani, P.inglese_base]);
  assert.strictEqual(s.packId, 'vulcani+inglese_base');
  assert.strictEqual(s.packVersion, '');
  var arcade = PL.composeArcade([P.vulcani, P.inglese_base]);
  assert.strictEqual(arcade.chain.length, 2);
  assert.deepStrictEqual(arcade.chain.map(function (x) { return x._packId; }), ['vulcani', 'inglese_base']);
  assert.strictEqual(arcade.photopuzzle[0]._packId, 'vulcani', 'le immagini dei giochi si risolvono nel loro pack');
  var bank = PL.composeBank([{ pack: P.vulcani, questions: P.vulcani.questions }, { pack: P.inglese_base, questions: P.inglese_base.questions }]);
  var prov = PL.provenance(bank[7]);
  assert.deepStrictEqual(prov, { packId: 'inglese_base', packVersion: '0.9.0', subject: 'Lingua inglese', topic: 'Animals', sourceQuestionId: 'q002' });
  assert.strictEqual(PL.storedQuestion(bank[7]).id, 'q002', 'le modifiche si salvano con l\'id originale');
});

/* ---------------- duplicazione, esportazione, eliminazione ---------------- */
test('duplicazione: copia indipendente con nuovo id e titolo; seconda copia con id diverso', async function () {
  var lib = tempLib();
  try {
    await lib.importFile('vulcani.zip', VULCANI(), { inflate: disk.inflate });
    var d1 = await lib.duplicate('vulcani');
    var d2 = await lib.duplicate('vulcani');
    assert.strictEqual(d1.id, 'vulcani-copia');
    assert.strictEqual(d2.id, 'vulcani-copia-2');
    assert.strictEqual(d1.summary.title, 'Vulcani (copia)');
    var meta = JSON.parse(fs.readFileSync(path.join(lib.packsDir, 'vulcani-copia', 'install.json'), 'utf8'));
    assert.deepStrictEqual(meta.derivedFrom, { id: 'vulcani', version: '1.0.0' });
    assert.ok(fs.existsSync(path.join(lib.packsDir, 'vulcani-copia', 'images', 'etna.png')), 'immagini copiate');
    var qf = path.join(lib.packsDir, 'vulcani-copia', 'questions.json');
    var q = JSON.parse(fs.readFileSync(qf, 'utf8'));
    q[0].question = 'Modificata nella copia';
    fs.writeFileSync(qf, JSON.stringify(q));
    assert.notStrictEqual(JSON.parse(fs.readFileSync(path.join(lib.packsDir, 'vulcani', 'questions.json'), 'utf8'))[0].question, 'Modificata nella copia');
    var custom = await lib.duplicate('vulcani', { newId: 'vulcani_2b', title: 'Vulcani per la 2B' });
    assert.strictEqual(custom.id, 'vulcani_2b');
    assert.strictEqual((await lib.duplicate('vulcani', { newId: 'vulcani_2b' })).ok, false, 'id già usato');
  } finally { H.rmrf(lib.dir); }
});

test('esportazione: .zip conforme, reimportabile identico (andata e ritorno)', async function () {
  var lib = tempLib();
  try {
    await lib.importFile('vulcani.zip', VULCANI(), { inflate: disk.inflate });
    var e = await lib.exportZip('vulcani');
    assert.strictEqual(e.ok, true);
    assert.strictEqual(e.filename, 'vulcani_v1.0.0.zip');
    var names = Object.keys(Z.unzip(e.bytes)).sort();
    assert.deepStrictEqual(names, ['vulcani/games.json', 'vulcani/images/cratere.png', 'vulcani/images/etna.png', 'vulcani/images/stromboli.png', 'vulcani/images/vesuvio.png', 'vulcani/pack.json', 'vulcani/questions.json']);
    assert.ok(names.indexOf('vulcani/install.json') < 0, 'i metadati di installazione non si esportano');
    assert.strictEqual((await lib.importFile(e.filename, e.bytes)).action, 'already-installed');
    var other = memLib();
    var r = await other.importFile(e.filename, e.bytes);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.summary.questions, 6);
    var meta = JSON.parse(fs.readFileSync(path.join(lib.packsDir, 'vulcani', 'install.json'), 'utf8'));
    assert.strictEqual((await other.list())[0].meta.fingerprint, meta.fingerprint, 'stesso contenuto, stessa impronta');
  } finally { H.rmrf(lib.dir); }
});

test('esportazione del pack Arte romana completo (72 domande, 33 manche, 24 immagini)', async function () {
  var lib = disk.diskLibrary({ packsDir: path.join(ROOT, 'packs'), rebuild: false });
  var e = await lib.exportZip('arte_romana');
  assert.strictEqual(e.ok, true, JSON.stringify(e.errors));
  var f = Z.unzip(e.bytes);
  assert.strictEqual(Object.keys(f).filter(function (n) { return /\/images\//.test(n); }).length, 24);
  var check = PL.validateImport(PL.readImport('arte.zip', e.bytes));
  assert.strictEqual(check.ok, true, check.errors.join('; '));
  assert.strictEqual(check.pack.questions.length, 72);
  assert.strictEqual(PE.countGames(check.pack.games), 33);
});

test('eliminazione: spostamento nel cestino, non più in elenco; l\'ultimo pack non si elimina', async function () {
  var lib = tempLib();
  try {
    await lib.importFile('vulcani.zip', VULCANI(), { inflate: disk.inflate });
    await lib.importFile('inglese.zip', INGLESE(), { inflate: disk.inflate });
    var r = await lib.remove('vulcani');
    assert.strictEqual(r.ok, true);
    assert.ok(!fs.existsSync(path.join(lib.packsDir, 'vulcani')));
    assert.ok(fs.readdirSync(path.join(lib.dir, 'cestino')).some(function (d) { return /^vulcani_/.test(d); }), 'recuperabile dal cestino');
    assert.deepStrictEqual((await lib.list()).map(function (p) { return p.id; }), ['inglese_base']);
    assert.ok(fs.readFileSync(path.join(lib.packsDir, 'packs.bundle.js'), 'utf8').indexOf('"id":"vulcani"') < 0, 'bundle aggiornato');
    var last = await lib.remove('inglese_base');
    assert.strictEqual(last.ok, false);
    assert.ok(/ultimo/.test(last.errors[0]));
  } finally { H.rmrf(lib.dir); }
});

test('libreria del browser: i pack del programma sono in sola lettura, la copia usa le loro immagini', async function () {
  var src = PE.validatePack(require('../tools/build_packs.js').loadPackFolder(path.join(ROOT, 'packs/arte_romana'))).pack;
  var lib = new PL.PackLibrary([PL.memoryAdapter('browser'), PL.sourcesAdapter([src], 'programma')]);
  assert.strictEqual((await lib.remove('arte_romana')).ok, false);
  assert.ok(/cartella del programma/.test((await lib.exportZip('arte_romana')).errors[0]));
  var d = await lib.duplicate('arte_romana');
  assert.strictEqual(d.ok, true);
  assert.strictEqual(d.sharedImages, true);
  var copy = (await lib.list()).filter(function (p) { return p.id === 'arte_romana-copia'; })[0];
  assert.strictEqual(PE.toRuntime(copy.pack).imageBase, 'packs/arte_romana/images/');
});

/* ---------------- API del server ---------------- */
test('server: elenco, importazione, duplicazione, esportazione ed eliminazione via /api/host/packs', async function () {
  var dir = H.tempDir();
  var packsDir = path.join(dir, 'packs');
  fs.mkdirSync(packsDir);
  var app = await H.startServer({ packsDir: packsDir });
  try {
    var hdr = { 'X-Secchione-Host': app.hostKey };
    var base = app.base + '/api/host/packs';
    assert.strictEqual((await H.get(base)).status, 403, 'solo la regia');
    var imp = await rawPost(base + '/import', VULCANI(), Object.assign({ 'X-File-Name': 'vulcani.zip' }, hdr));
    assert.strictEqual(imp.action, 'installed');
    var imp2 = await rawPost(base + '/import', INGLESE(), Object.assign({ 'X-File-Name': 'inglese.zip' }, hdr));
    assert.strictEqual(imp2.id, 'inglese_base');
    var list = JSON.parse((await H.get(base, { headers: hdr })).body);
    assert.deepStrictEqual(list.packs.map(function (p) { return p.id; }), ['inglese_base', 'vulcani']);
    var dup = JSON.parse((await H.get(base + '/vulcani/duplicate', { method: 'POST', headers: hdr, body: '{}' })).body);
    assert.strictEqual(dup.id, 'vulcani-copia');
    var exp = await rawGet(base + '/vulcani/export', hdr);
    assert.strictEqual(exp.status, 200);
    assert.ok(/vulcani_v1\.0\.0\.zip/.test(exp.headers['content-disposition']));
    assert.strictEqual(Object.keys(Z.unzip(new Uint8Array(exp.body))).length, 7);
    var del = JSON.parse((await H.get(base + '/vulcani-copia', { method: 'DELETE', headers: hdr })).body);
    assert.strictEqual(del.ok, true);
    var bad = await rawPost(base + '/import', new Uint8Array([1, 2, 3]), Object.assign({ 'X-File-Name': 'x.zip' }, hdr));
    assert.strictEqual(bad.ok, false);
    assert.strictEqual((await H.get(base + '/..%2F..%2Fdata/export', { headers: hdr })).status, 400);
  } finally { await H.stopServer(app); H.rmrf(dir); }
});

function rawPost(url, data, headers) {
  return new Promise(function (resolve, reject) {
    var u = new (require('url').URL)(url);
    var req = require('http').request({ host: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: Object.assign({ 'Content-Type': 'application/octet-stream', 'Content-Length': data.length }, headers) }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.end(Buffer.from(data));
  });
}
function rawGet(url, headers) {
  return new Promise(function (resolve, reject) {
    var u = new (require('url').URL)(url);
    require('http').get({ host: u.hostname, port: u.port, path: u.pathname, headers: headers }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () { resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }); });
    }).on('error', reject);
  });
}
