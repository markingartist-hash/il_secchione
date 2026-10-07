'use strict';
/* Pack Studio: modello della bozza, validazione, immagini piatte, manche speciali, ZIP, riapertura, salvataggio in libreria. */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var test = require('./harness.js').test;
var PS = require('../js/engine/packstudio.js');
var PL = require('../js/engine/packlib.js');
var PE = require('../js/engine/packs.js');
var Z = require('../js/lib/zip.js');
var disk = require('../server/packstore-disk.js');
var H = require('./helpers.js');

var ROOT = path.join(__dirname, '..');
var PNG = new Uint8Array(fs.readFileSync(path.join(ROOT, 'PACK_ESEMPI/vulcani/images/etna.png')));
var JPG = new Uint8Array(fs.readFileSync(path.join(ROOT, 'packs/arte_romana/images/arco.jpg')));

function fillQuestion(d, i, text) {
  var q = d.questions[i];
  q.question = text || 'Qual è la capitale d’Italia?';
  q.options = ['Roma', 'Milano', 'Napoli', 'Torino'];
  q.correct = 'A';
  q.explanation = 'Roma è la capitale.';
  q.category = 'Geografia';
  q.topic = 'Capitali';
  return q;
}
function validDraft() {
  var d = PS.newDraft({ title: 'Capitali d’Europa', subject: 'Geografia', grade: 1, author: 'Prova' });
  fillQuestion(d, PS.addQuestion(d));
  return d;
}

/* ---------------- bozza e domande ---------------- */
test('nuovo pacchetto: valori iniziali, codice dal titolo, validazione che chiede almeno una domanda', function () {
  var d = PS.newDraft({ title: 'Capitali d’Europa', subject: 'Geografia', grade: 1, author: 'Mario' });
  assert.strictEqual(d.manifest.id, 'capitali_d_europa');
  assert.strictEqual(d.manifest.version, '1.0.0');
  assert.strictEqual(d.manifest.format, 'secchione-pack');
  var v = PS.validate(d);
  assert.strictEqual(v.ok, false);
  assert.ok(v.errors.some(function (e) { return /non ha domande/.test(e.message); }));
});

test('domande: crea, duplica, sposta, elimina con codici unici', function () {
  var d = validDraft();
  var i = PS.addQuestion(d);
  fillQuestion(d, i, 'Qual è la capitale della Francia?').options = ['Parigi', 'Lione', 'Nizza', 'Lilla'];
  var j = PS.duplicateQuestion(d, 1);
  assert.strictEqual(j, 2);
  var ids = d.questions.map(function (q) { return q.id; });
  assert.strictEqual(new Set(ids).size, 3, ids.join(','));
  assert.strictEqual(PS.moveQuestion(d, 2, -1), 1);
  assert.strictEqual(d.questions[1].id, ids[2]);
  PS.deleteQuestion(d, 0);
  assert.strictEqual(d.questions.length, 2);
  assert.strictEqual(PS.validate(d).ok, true, JSON.stringify(PS.validate(d).errors));
});

test('validazione: indica quale domanda correggere e perché', function () {
  var d = validDraft();
  var i = PS.addQuestion(d);
  d.questions[i].question = 'Domanda incompleta?';
  d.questions[i].options = ['uno', 'due', 'due', ''];
  var v = PS.validate(d);
  assert.strictEqual(v.ok, false);
  var e = v.errors.filter(function (x) { return x.where.kind === 'question'; })[0];
  assert.strictEqual(e.where.index, 1);
  assert.ok(/alternativa/.test(e.message), e.message);
  d.questions[i].options = ['uno', 'due', 'tre', 'quattro'];
  d.questions[i].correct = 'E';
  assert.ok(/correct/.test(PS.validate(d).errors[0].message));
  d.questions[i].correct = 'C';
  d.questions[i].seconds = 45;
  d.questions[i].difficulty = 3;
  assert.strictEqual(PS.validate(d).ok, true);
});

test('argomento, categoria e tag: conservati nel pacchetto e validati', function () {
  var d = validDraft();
  d.questions[0].tags = PS.parseTags('storia, Roma antica; storia,  ');
  assert.deepStrictEqual(d.questions[0].tags, ['storia', 'Roma antica']);
  var z = PS.toZip(d);
  var q = PL.validateImport(PL.readImport('x.zip', z.bytes)).pack.questions[0];
  assert.deepStrictEqual(q.tags, ['storia', 'Roma antica']);
  assert.strictEqual(q.topic, 'Capitali');
  assert.strictEqual(q.category, 'Geografia');
  d.questions[0].tags = new Array(12).join('t,').split(',').map(function (x, i) { return 'tag' + i; });
  assert.ok(PS.validate(d).errors.some(function (e) { return /tag/.test(e.message); }));
});

test('bozze escluse dalla gara: avviso, e errore se nessuna domanda è approvata', function () {
  var d = validDraft();
  fillQuestion(d, PS.addQuestion(d), 'Seconda?').status = 'draft';
  var v = PS.validate(d);
  assert.strictEqual(v.ok, true);
  assert.ok(v.warnings.some(function (w) { return /bozza/.test(w.message); }));
  d.questions[0].status = 'draft';
  assert.ok(PS.validate(d).errors.some(function (e) { return /approvata/.test(e.message); }));
});

/* ---------------- immagini (sempre piatte in images/) ---------------- */
test('immagini: nome sicuro e senza cartelle, estensione dai byte reali, nomi unici', function () {
  var d = validDraft();
  var a = PS.addImage(d, 'C:\\foto\\Città Antica.PNG', PNG);
  assert.strictEqual(a.name, 'citta_antica.png');
  var b = PS.addImage(d, 'citta antica.png', PNG);
  assert.strictEqual(b.name, 'citta_antica_2.png');
  var c = PS.addImage(d, 'sottocartella/foto.png', JPG);
  assert.strictEqual(c.name, 'foto.jpg', 'il JPG chiamato .png prende l\'estensione giusta');
  assert.ok(Object.keys(d.images).every(function (n) { return n.indexOf('/') < 0 && n.indexOf('\\') < 0; }));
  assert.strictEqual(PS.addImage(d, 'testo.png', new Uint8Array(Buffer.from('non sono un\'immagine, solo testo'))).ok, false);
  var big = new Uint8Array(PL.LIMITS.maxImageBytes + 10);
  big.set(PNG.subarray(0, 16));
  assert.ok(/troppo grande/.test(PS.addImage(d, 'grande.png', big).error));
});

test('immagini: associazione, uso, rinomina con aggiornamento dei riferimenti, eliminazione protetta', function () {
  var d = validDraft();
  var img = PS.addImage(d, 'etna.png', PNG).name;
  d.questions[0].image = img;
  var g = PS.addGame(d, 'photopuzzle');
  d.games.photopuzzle[g] = { label: 'Vulcano', theme: 'Sicilia', seconds: 30, image: img, answer: 'Etna' };
  assert.strictEqual(PS.imageUsage(d)[img].length, 2);
  var r = PS.renameImage(d, img, 'Monte Etna');
  assert.strictEqual(r.name, 'monte_etna.png');
  assert.strictEqual(d.questions[0].image, 'monte_etna.png');
  assert.strictEqual(d.games.photopuzzle[0].image, 'monte_etna.png');
  assert.strictEqual(PS.removeImage(d, 'monte_etna.png').ok, false, 'immagine usata: serve conferma');
  assert.strictEqual(PS.removeImage(d, 'monte_etna.png', true).cleared, 2);
  assert.strictEqual(d.questions[0].image, '');
});

test('immagine citata ma assente: errore sulla domanda giusta', function () {
  var d = validDraft();
  d.questions[0].image = 'non_esiste.png';
  var e = PS.validate(d).errors.filter(function (x) { return x.where.kind === 'question'; })[0];
  assert.strictEqual(e.where.index, 0);
  assert.ok(/non presente/.test(e.message));
});

test('riapertura di un pacchetto con immagini in sottocartelle: spostate direttamente in images/', function () {
  var full = PS.toFull(validDraft());
  full.questions[0].image = 'sub/etna.png';
  var zip = Z.zip([{ name: 'p/pack.json', data: JSON.stringify(Object.assign({}, full, { questions: undefined, games: undefined })) }, { name: 'p/questions.json', data: JSON.stringify(full.questions) }, { name: 'p/images/sub/etna.png', data: PNG }]);
  var raw = PL.readImport('p.zip', zip);
  assert.ok(PL.validateImport(raw).warnings.some(function (w) { return /sottocartelle/.test(w); }), 'l\'importazione avvisa delle sottocartelle');
  var d = PS.draftFromImport(raw);
  assert.deepStrictEqual(Object.keys(d.images), ['sub_etna.png']);
  assert.strictEqual(d.questions[0].image, 'sub_etna.png');
  assert.strictEqual(d.origin.flattened.length, 1);
  assert.strictEqual(PS.validate(d).ok, true);
  assert.ok(Object.keys(Z.unzip(PS.toZip(d).bytes)).every(function (n) { return !/images\/.+\//.test(n); }));
});

/* ---------------- manche speciali ---------------- */
test('manche speciali: tutte e cinque si creano vuote (non valide) e diventano valide una volta compilate', function () {
  var d = validDraft();
  var img = PS.addImage(d, 'etna.png', PNG).name;
  PS.GAME_TYPES.forEach(function (t) { PS.addGame(d, t); });
  var v = PS.validate(d);
  PS.GAME_TYPES.forEach(function (t) { assert.ok(v.errors.some(function (e) { return e.where.kind === 'game' && e.where.type === t; }), t); });
  d.games.photopuzzle[0] = { label: 'Foto', theme: 'Vulcani', seconds: 30, image: img, answer: 'Etna' };
  d.games.indovina[0] = { label: 'Chi sono', theme: 'Città', seconds: 40, subject: 'Roma', candidates: ['Roma', 'Parigi', 'Madrid'], clues: ['Sono in Italia.', 'Ho sette colli.'] };
  d.games.abbinamenti[0] = { label: 'Abbina', theme: 'Vulcani', seconds: 30, cards: [0, 1, 2, 3].map(function (k) { return { img: img, title: 'Immagine ' + (k + 1) }; }), names: ['Etna', 'Vesuvio', 'Stromboli', 'Vulcano'] };
  d.games.ghigliottina[0] = { label: 'Parola', theme: 'Acqua', seconds: 30, answer: 'FIUME', pairs: [['Foce', 'Cima'], ['Sorgente', 'Deserto'], ['Argine', 'Vetta'], ['Affluente', 'Duna'], ['Delta', 'Cratere']] };
  d.games.chain[0] = { label: 'Staffetta', theme: 'Acqua', seconds: 30, links: PS.parseChainText('NEVE | SORGENTE | FIUME | MARE') };
  assert.strictEqual(d.games.chain[0].links.length, 3);
  var ok = PS.validate(d);
  assert.strictEqual(ok.ok, true, JSON.stringify(ok.errors));
  var back = PL.validateImport(PL.readImport('x.zip', PS.toZip(d).bytes)).pack;
  assert.strictEqual(PE.countGames(back.games), 5);
  assert.strictEqual(back.games.indovina[0].seconds, 40);
});

test('manche: duplica, sposta, elimina; la Parola Segreta richiede esattamente 5 coppie', function () {
  var d = validDraft();
  PS.addGame(d, 'ghigliottina');
  d.games.ghigliottina[0] = { label: 'P1', theme: 'T', seconds: 30, answer: 'ARCO', pairs: [['a', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h']] };
  var e = PS.validate(d).errors.filter(function (x) { return x.where.type === 'ghigliottina'; })[0];
  assert.ok(/5 coppie/.test(e.message), e.message);
  d.games.ghigliottina[0].pairs.push(['i', 'l']);
  assert.strictEqual(PS.duplicateGame(d, 'ghigliottina', 0), 1);
  assert.strictEqual(d.games.ghigliottina[1].label, 'P1 (copia)');
  assert.strictEqual(PS.moveGame(d, 'ghigliottina', 1, -1), 0);
  PS.deleteGame(d, 'ghigliottina', 0);
  assert.strictEqual(d.games.ghigliottina.length, 1);
  assert.strictEqual(PS.validate(d).ok, true);
});

/* ---------------- ZIP, riapertura, versioni ---------------- */
test('esportazione ZIP: conforme al formato, immagini piatte, reimportabile e riapribile nello Studio', function () {
  var d = validDraft();
  d.questions[0].image = PS.addImage(d, 'etna.png', PNG).name;
  d.manifest.theme.homeImage = d.questions[0].image;
  var z = PS.toZip(d);
  assert.strictEqual(z.filename, 'capitali_d_europa_v1.0.0.zip');
  var names = Object.keys(Z.unzip(z.bytes)).sort();
  assert.deepStrictEqual(names, ['capitali_d_europa/games.json', 'capitali_d_europa/images/etna.png', 'capitali_d_europa/pack.json', 'capitali_d_europa/questions.json']);
  var raw = PL.readImport(z.filename, z.bytes);
  var d2 = PS.draftFromImport(raw);
  assert.strictEqual(d2.manifest.title, 'Capitali d’Europa');
  assert.strictEqual(d2.questions[0].question, d.questions[0].question);
  assert.strictEqual(d2.questions[0].image, 'etna.png');
  assert.strictEqual(PS.validate(d2).ok, true);
});

test('un pacchetto con errori non si esporta', function () {
  var d = validDraft();
  d.questions[0].options[2] = '';
  assert.throws(function () { PS.toZip(d); }, /errori/);
});

test('riapertura del pacchetto Arte romana completo: modifica e nuovo ZIP valido (72 domande, 33 manche, 24 immagini)', async function () {
  var lib = disk.diskLibrary({ packsDir: path.join(ROOT, 'packs'), rebuild: false });
  var e = await lib.exportZip('arte_romana');
  var d = PS.draftFromImport(PL.readImport(e.filename, e.bytes), { libraryId: 'arte_romana' });
  assert.strictEqual(d.questions.length, 72);
  assert.strictEqual(PS.summary(d).games, 33);
  d.questions[0].explanation = 'Spiegazione modificata in Pack Studio.';
  var v = PS.validate(d);
  assert.strictEqual(v.ok, true, JSON.stringify(v.errors.slice(0, 3)));
  var back = PL.validateImport(PL.readImport('a.zip', PS.toZip(d).bytes));
  assert.strictEqual(back.ok, true);
  assert.strictEqual(back.pack.questions[0].explanation, 'Spiegazione modificata in Pack Studio.');
  assert.strictEqual(Object.keys(back.images).length, 24);
  assert.strictEqual(back.pack.questions[0].sourcePage, 1, 'i campi aggiuntivi del pack (fonte) sono conservati');
});

test('versione: incremento automatico e impronta che cambia solo se cambia il contenuto', function () {
  assert.strictEqual(PS.bumpVersion('1.0.0'), '1.0.1');
  assert.strictEqual(PS.bumpVersion('2'), '2.0.1');
  assert.strictEqual(PS.bumpVersion('1.2.9-copia'), '1.2.10');
  assert.strictEqual(PS.bumpVersion(''), '1.0.1');
  var d = validDraft();
  var k = PS.contentKey(d);
  assert.strictEqual(PS.contentKey(PS.deserialize(PS.serialize(d))), k, 'serializzazione delle bozze senza perdite');
  d.questions[0].explanation += '!';
  assert.notStrictEqual(PS.contentKey(d), k);
});

/* ---------------- salvataggio nella libreria ---------------- */
test('salvataggio in libreria (browser): nuovo, conflitto senza conferma, sostituzione esplicita', async function () {
  var lib = new PL.PackLibrary([PL.memoryAdapter('browser')]);
  var d = validDraft();
  var r1 = await lib.save('x.zip', PS.toZip(d).bytes, { mode: 'new', expectedId: d.manifest.id });
  assert.strictEqual(r1.ok, true, JSON.stringify(r1.errors));
  assert.strictEqual(r1.replaced, false);
  d.questions[0].explanation = 'Seconda versione';
  d.manifest.version = PS.bumpVersion(d.manifest.version);
  var conflict = await lib.save('x.zip', PS.toZip(d).bytes, { mode: 'new' });
  assert.strictEqual(conflict.ok, false);
  assert.ok(/esiste già/.test(conflict.errors[0]));
  var r2 = await lib.save('x.zip', PS.toZip(d).bytes, { mode: 'replace', expectedId: d.manifest.id });
  assert.strictEqual(r2.ok, true);
  assert.strictEqual(r2.replaced, true);
  assert.strictEqual(r2.previousVersion, '1.0.0');
  var list = await lib.list();
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].pack.questions[0].explanation, 'Seconda versione');
  assert.strictEqual(list[0].summary.version, '1.0.1');
  assert.strictEqual(lib.adapters[0].backups.length, 1, 'versione precedente conservata');
  var mismatch = await lib.save('x.zip', PS.toZip(d).bytes, { mode: 'replace', expectedId: 'altro_codice' });
  assert.strictEqual(mismatch.ok, false);
});

test('salvataggio: rifiutate immagini in sottocartelle e sostituzione di un pacchetto del programma in sola lettura', async function () {
  var src = PE.validatePack(require('../tools/build_packs.js').loadPackFolder(path.join(ROOT, 'packs/arte_romana'))).pack;
  var lib = new PL.PackLibrary([PL.memoryAdapter('browser'), PL.sourcesAdapter([src], 'programma')]);
  var d = validDraft();
  d.manifest.id = 'arte_romana';
  var r = await lib.save('a.zip', PS.toZip(d).bytes, { mode: 'replace' });
  assert.strictEqual(r.ok, false);
  assert.ok(/pacchetto del programma/.test(r.errors[0]), r.errors[0]);
  var full = PS.toFull(validDraft());
  full.questions[0].image = 'sub/etna.png';
  var nested = Z.zip([{ name: 'p/pack.json', data: JSON.stringify(Object.assign({}, full, { questions: undefined, games: undefined })) }, { name: 'p/questions.json', data: JSON.stringify(full.questions) }, { name: 'p/images/sub/etna.png', data: PNG }]);
  var n = await lib.save('n.zip', nested, { mode: 'new' });
  assert.strictEqual(n.ok, false);
  assert.ok(/direttamente in images/.test(n.errors[0]));
});

test('salvataggio su disco: sostituzione atomica con copia di sicurezza nel cestino e bundle aggiornato', async function () {
  var dir = H.tempDir();
  var packsDir = path.join(dir, 'packs');
  fs.mkdirSync(packsDir);
  var lib = disk.diskLibrary({ packsDir: packsDir, trashDir: path.join(dir, 'cestino') });
  try {
    var d = validDraft();
    d.questions[0].image = PS.addImage(d, 'etna.png', PNG).name;
    assert.strictEqual((await lib.save('x.zip', PS.toZip(d).bytes, { mode: 'new', inflate: disk.inflate })).ok, true);
    d.questions[0].question = 'Domanda cambiata?';
    d.manifest.version = '1.1.0';
    var r = await lib.save('x.zip', PS.toZip(d).bytes, { mode: 'replace', inflate: disk.inflate });
    assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
    assert.ok(/_prima-della-modifica$/.test(r.backup));
    var q = JSON.parse(fs.readFileSync(path.join(packsDir, 'capitali_d_europa', 'questions.json'), 'utf8'));
    assert.strictEqual(q[0].question, 'Domanda cambiata?');
    var old = JSON.parse(fs.readFileSync(path.join(dir, 'cestino', r.backup, 'questions.json'), 'utf8'));
    assert.strictEqual(old[0].question, 'Qual è la capitale d’Italia?', 'la versione precedente è recuperabile');
    assert.ok(fs.existsSync(path.join(packsDir, 'capitali_d_europa', 'images', 'etna.png')));
    var meta = JSON.parse(fs.readFileSync(path.join(packsDir, 'capitali_d_europa', 'install.json'), 'utf8'));
    assert.strictEqual(meta.editedWith, 'Pack Studio');
    assert.strictEqual(meta.previousVersion, '1.0.0');
    assert.ok(fs.readFileSync(path.join(packsDir, 'packs.bundle.js'), 'utf8').indexOf('Domanda cambiata?') > 0);
    assert.ok(!fs.readdirSync(packsDir).some(function (x) { return /^\.tmp-/.test(x); }));
  } finally { H.rmrf(dir); }
});

test('server: PUT /api/host/packs/<id> (nuovo, conflitto, sostituzione) e pagina /studio solo per la regia', async function () {
  var dir = H.tempDir();
  var packsDir = path.join(dir, 'packs');
  fs.mkdirSync(packsDir);
  var app = await H.startServer({ packsDir: packsDir });
  try {
    var hdr = { 'X-Secchione-Host': app.hostKey };
    var d = validDraft();
    var url = app.base + '/api/host/packs/' + d.manifest.id;
    assert.strictEqual((await put(url, PS.toZip(d).bytes, {})).status, 403, 'solo la regia');
    var r1 = await put(url, PS.toZip(d).bytes, hdr);
    assert.strictEqual(r1.status, 200);
    assert.strictEqual(r1.json.ok, true);
    var conflict = await put(url, PS.toZip(d).bytes, hdr);
    assert.strictEqual(conflict.status, 400);
    var r2 = await put(url + '?mode=replace', PS.toZip(d).bytes, hdr);
    assert.strictEqual(r2.json.replaced, true);
    var wrongId = await put(app.base + '/api/host/packs/altro_codice', PS.toZip(d).bytes, hdr);
    assert.strictEqual(wrongId.json.ok, false);
    var studio = await H.get(app.base + '/studio');
    assert.strictEqual(studio.status, 200);
    assert.ok(studio.body.indexOf('content="' + app.hostKey + '"') > 0, 'chiave regia iniettata nello Studio');
    var lan = require('../server/netinfo.js').lanAddresses()[0];
    if (lan) assert.strictEqual((await H.get('http://' + lan.address + ':' + app.port + '/studio', { localAddress: lan.address })).status, 403, 'mai da un altro dispositivo');
  } finally { await H.stopServer(app); H.rmrf(dir); }
});

function put(url, data, headers) {
  return new Promise(function (resolve, reject) {
    var u = new (require('url').URL)(url);
    var req = require('http').request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/zip', 'Content-Length': data.length }, headers) }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () { var body = Buffer.concat(chunks).toString('utf8'); var json = null; try { json = JSON.parse(body); } catch (e) { /* non JSON */ } resolve({ status: res.statusCode, json: json, body: body }); });
    });
    req.on('error', reject);
    req.end(Buffer.from(data));
  });
}
