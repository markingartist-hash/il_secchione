'use strict';
/* v3.7.3 CONTENT IMPORT AND PODIUM REVEAL: IMPORTA CONTENUTI (riconoscimento, sostituzione, persistenza)
   e classifica finale rivelata dall'ultimo al primo posto. */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var zlib = require('zlib');
var test = require('./harness.js').test;
var H = require('./helpers.js');
var RC = require('../js/engine/roundControl.js');
var PE = require('../js/engine/packs.js');
var PL = require('../js/engine/packlib.js');
var PS = require('../js/engine/packstudio.js');
var SS = require('../js/engine/session.js');
var SC = require('../js/engine/scoring.js');
var disk = require('../server/packstore-disk.js');

var ROOT = path.join(__dirname, '..');
function source(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function inflate(b) { return new Uint8Array(zlib.inflateRawSync(Buffer.from(b))); }
function same(a, b, msg) { assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg); }
function extract(names) {
  var src = source('js/app.js');
  return names.map(function (name) {
    var start = src.indexOf('function ' + name + '(');
    assert.ok(start >= 0, 'funzione della regia: ' + name);
    var rest = src.slice(start);
    var next = /^(async )?function \w+\(/m.exec(rest.slice(rest.indexOf('\n') + 1));
    return next ? rest.slice(0, rest.indexOf('\n') + 1 + next.index) : rest;
  }).join('\n');
}
function runtimeOf(dir) { return PE.toRuntime(PE.validatePack(require('../tools/build_packs.js').loadPackFolder(dir)).pack, { origin: 'installed' }); }
function copyDir(src, dst) { fs.mkdirSync(dst, { recursive: true }); fs.readdirSync(src).forEach(function (f) { var p = path.join(src, f); if (fs.statSync(p).isDirectory()) copyDir(p, path.join(dst, f)); else fs.copyFileSync(p, path.join(dst, f)); }); }
var RT = runtimeOf(path.join(ROOT, 'packs/arte_romana'));

/* ---------------- 1. riconoscimento del file ---------------- */
test('Importa contenuti: il tipo si riconosce dal contenuto (domande, giochi, pacchetto, scaletta, risultati, altro)', function () {
  var bank = PL.composeBank([{ pack: RT, questions: RT.questions }]);
  assert.strictEqual(PL.contentKind(JSON.parse(JSON.stringify(bank))).kind, 'questions', 'export ARCHIVIO (elenco)');
  assert.strictEqual(PL.contentKind({ questions: bank }).kind, 'questions');
  assert.strictEqual(PL.contentKind({ format: 'secchione-games', version: 3, games: RT.arcadeSets }).kind, 'games', 'export GIOCHI');
  assert.strictEqual(PL.contentKind({ version: 3, games: { chain: [] } }).kind, 'games', 'export giochi della v3');
  assert.strictEqual(PL.contentKind({ format: PE.FORMAT, id: 'x', questions: [] }).kind, 'pack');
  assert.strictEqual(PL.contentKind({ format: 'secchione-scaletta', items: [] }).kind, 'plan');
  assert.strictEqual(PL.contentKind({ format: 'secchione-snapshot', session: { sessionId: 's' } }).kind, 'results', 'JSON COMPLETO dei risultati');
  assert.strictEqual(PL.contentKind({ hello: 'world' }).kind, 'unknown');
  assert.strictEqual(PL.contentKind('testo').kind, 'unknown');
  assert.strictEqual(PL.contentKind(null).kind, 'unknown');
});

test('Importa contenuti: giochi = sostituzione dei tipi presenti nel file, gli altri restano; campi della sessione mista tolti', function () {
  var chain = [Object.assign({}, RT.arcadeSets.chain[0], { _packId: 'altro', _packTitle: 'Altro', label: 'Nuova staffetta' })];
  var r = PL.replaceGames(RT.arcadeSets, { chain: chain, indovina: [] });
  assert.strictEqual(r.imported, 1);
  same(r.replacedTypes, ['chain']);
  assert.strictEqual(r.games.chain.length, 1);
  assert.strictEqual(r.games.chain[0].label, 'Nuova staffetta');
  assert.ok(!('_packId' in r.games.chain[0]) && !('_packTitle' in r.games.chain[0]));
  PE.GAME_TYPES.filter(function (t) { return t !== 'chain'; }).forEach(function (t) { assert.strictEqual(r.games[t].length, (RT.arcadeSets[t] || []).length, t + ' invariato'); });
  var row = r.rows.filter(function (x) { return x.type === 'chain'; })[0];
  same([row.before, row.inFile, row.after, row.replaced], [RT.arcadeSets.chain.length, 1, 1, true]);
  assert.strictEqual(PL.replaceGames(RT.arcadeSets, {}).imported, 0, 'file vuoto: nulla da sostituire');
});

test('Importa contenuti: esporta ARCHIVIO → reimporta → id originali senza prefisso del pacchetto', function () {
  var exported = JSON.parse(JSON.stringify(PL.composeBank([{ pack: RT, questions: RT.questions }])));
  var res = PE.importV3Questions(PL.contentKind(exported).list, RT, function () { return SS.uuid(); });
  assert.strictEqual(res.errors.length, 0);
  var stored = res.questions.map(function (q) { var x = PL.storedQuestion(q); x.id = PL.storedQuestionId(x.id); return x; });
  same(stored.map(function (q) { return q.id; }), RT.questions.map(function (q) { return q.id; }));
  assert.strictEqual(PL.storedQuestionId('arte_romana/rom001'), 'rom001');
  assert.strictEqual(PL.storedQuestionId('rom001'), 'rom001');
});

/* ---------------- 2. salvataggio nel pacchetto installato (fonte unica, chiudi/riapri) ---------------- */
async function diskCtx() {
  var dir = H.tempDir(), packsDir = path.join(dir, 'packs');
  copyDir(path.join(ROOT, 'packs/arte_romana'), path.join(packsDir, 'arte_romana'));
  var lib = disk.diskLibrary({ packsDir: packsDir, trashDir: path.join(dir, 'cestino') });
  await lib.list();
  var ctx = {
    PS: PS, PL: PL, PE: PE, C: { clone: function (x) { return JSON.parse(JSON.stringify(x)); } },
    state: { packKey: 'arte_romana', mixed: false, bank: PL.composeBank([{ pack: RT, questions: RT.questions }]) },
    P: { arte_romana: RT }, customGames: {}, bankOverrides: {}, prefsSaved: 0, refreshed: 0, rebuilt: 0, packSaveChain: Promise.resolve(),
    savePrefs: function () { ctx.prefsSaved++; }, refreshLibrary: function () { ctx.refreshed++; return Promise.resolve(true); },
    buildPacks: function () { ctx.rebuilt++; return ctx.P; }, buildMixPack: function () { return null; }, activeRuntimes: function () { return []; },
    packQuestionsFromBank: function () { return []; },
    PKC: {
      openBytes: function (id) { return lib.exportZip(id).then(function (r) { return r.ok ? { ok: true, bytes: r.bytes, filename: r.filename } : r; }); },
      save: function (id, bytes, mode) { return lib.save(id + '.zip', bytes, { mode: mode, expectedId: id, inflate: disk.inflate }); }
    },
    Promise: Promise, Object: Object
  };
  vm.runInNewContext('var packSaveChain=Promise.resolve();\n' + extract(['savePackQuestions', 'savePackGames']), ctx);
  return { ctx: ctx, dir: dir, packsDir: packsDir, reopen: function () { var l2 = disk.diskLibrary({ packsDir: packsDir, trashDir: path.join(dir, 'cestino') }); return l2.exportZip('arte_romana').then(function (ex) { return PL.validateImport(PL.readImport(ex.filename, ex.bytes, { inflate: inflate })).pack; }); } };
}

test('Importa giochi: sostituzione salvata nel pacchetto su disco, versione aumentata, copia nel cestino; resta dopo la riapertura', async function () {
  var d = await diskCtx();
  try {
    var base = JSON.parse(fs.readFileSync(path.join(d.packsDir, 'arte_romana', 'pack.json'), 'utf8')).version;
    var plan = PL.replaceGames(RT.arcadeSets, { photopuzzle: [Object.assign({}, RT.arcadeSets.photopuzzle[0], { label: 'Solo questa' })] });
    var r = await d.ctx.savePackGames('arte_romana', plan.games);
    assert.strictEqual(r.where, 'pack', JSON.stringify(r));
    assert.strictEqual(r.version, PS.bumpVersion(base));
    var pack = await d.reopen();
    assert.strictEqual(pack.games.photopuzzle.length, 1);
    assert.strictEqual(pack.games.photopuzzle[0].label, 'Solo questa');
    assert.strictEqual(pack.games.chain.length, RT.arcadeSets.chain.length, 'gli altri tipi restano');
    assert.strictEqual(pack.questions.length, RT.questions.length, 'le domande non cambiano');
    assert.ok(fs.readdirSync(path.join(d.dir, 'cestino')).some(function (n) { return /^arte_romana_.*_prima-della-modifica$/.test(n); }));
    same(d.ctx.customGames, {}, 'nessuna copia parallela nel browser');
    // pacchetto in sola lettura: tutti i tipi finiscono nella copia del browser (anche Photopuzzle e Abbinamenti)
    d.ctx.PKC.openBytes = function () { return Promise.resolve({ ok: false }); };
    var ro = await d.ctx.savePackGames('arte_romana', plan.games);
    assert.strictEqual(ro.where, 'browser');
    assert.strictEqual(d.ctx.customGames.arte_romana.photopuzzle.length, 1);
    assert.strictEqual(d.ctx.customGames.arte_romana.abbinamenti.length, RT.arcadeSets.abbinamenti.length);
    assert.ok(d.ctx.rebuilt >= 1, 'runtime ricostruito');
  } finally { H.rmrf(d.dir); }
});

test('Importa domande: 5 domande esportate e modificate sostituiscono le 72 nel pacchetto; il backup le ripristina', async function () {
  var d = await diskCtx();
  try {
    var exported = JSON.parse(JSON.stringify(d.ctx.state.bank));
    var five = exported.slice(0, 5); five[0].question = 'Modificata fuori dal programma?';
    var res = PE.importV3Questions(PL.contentKind(five).list, RT, function () { return SS.uuid(); });
    var qs = res.questions.map(function (q) { var x = PL.storedQuestion(q); x.id = PL.storedQuestionId(x.id); return x; });
    var r = await d.ctx.savePackQuestions('arte_romana', { all: qs });
    assert.strictEqual(r.where, 'pack');
    var pack = await d.reopen();
    assert.strictEqual(pack.questions.length, 5);
    assert.strictEqual(pack.questions[0].question, 'Modificata fuori dal programma?');
    assert.strictEqual(pack.questions[0].id, RT.questions[0].id);
    var back = PE.importV3Questions(PL.contentKind(exported).list, RT, function () { return SS.uuid(); }).questions.map(function (q) { var x = PL.storedQuestion(q); x.id = PL.storedQuestionId(x.id); return x; });
    await d.ctx.savePackQuestions('arte_romana', { all: back });
    assert.strictEqual((await d.reopen()).questions.length, RT.questions.length, 'backup ripristinato');
  } finally { H.rmrf(d.dir); }
});

/* ---------------- 3. regia: cablaggio di IMPORTA CONTENUTI ---------------- */
test('Importa contenuti: un solo ingresso (pulsante, ARCHIVIO, GIOCHI, trascinamento), conferma con backup, niente vecchi import paralleli', function () {
  var html = source('index.html'), app = source('js/app.js'), pk = source('js/host/packs-ui.js');
  assert.ok(/id="importContentBtn"[^>]*>📥 IMPORTA CONTENUTI</.test(html));
  assert.ok(/<dialog id="importDialog"/.test(html));
  assert.ok(html.indexOf('Importa qui un file .json esportato dall’archivio domande') >= 0);
  assert.ok(html.indexOf('Importa qui un file .json esportato con ESPORTA GIOCHI') >= 0);
  assert.ok(/\$\('#importBankInput'\)\.onchange=.{0,120}importContent\(f\)/.test(app));
  assert.ok(/\$\('#importGamesInput'\)\.onchange=.{0,120}importContent\(f\)/.test(app));
  assert.ok(/ctx\.importContent && files\.length === 1/.test(pk), 'trascinare un file sulla regia apre IMPORTA CONTENUTI');
  assert.strictEqual(app.indexOf('function importBank('), -1, 'vecchio import domande rimosso');
  assert.strictEqual(app.indexOf('function importGames('), -1, 'vecchio import giochi (che aggiungeva) rimosso');
  ['ESPORTA BACKUP PRIMA DI CONTINUARE', 'CONTINUA SENZA BACKUP', 'Sostituzione, non unione', 'Hai importato', 'Pacchetto installato correttamente', 'Verranno sostituite le'].forEach(function (s) { assert.ok(app.indexOf(s) >= 0, s); });
  assert.ok(/for\(const type of PE\.GAME_TYPES\)/.test(app), 'la copia del browser accetta tutti i tipi di gioco');
});

test('Importa contenuti: bloccato con domanda/gioco in corso e in sessione mista; il dialogo descrive cosa e dove', function () {
  var ctx = { RC: RC, state: { screen: 'question', phase: 'running', mixed: false } };
  vm.runInNewContext(extract(['importBusyReason']), ctx);
  assert.ok(/in corso/.test(ctx.importBusyReason()));
  ctx.state = { screen: 'arcade', arcade: { started: true }, mixed: false };
  assert.ok(/in corso/.test(ctx.importBusyReason()));
  ctx.state = { screen: 'home', mixed: true };
  assert.ok(/Sessione mista/.test(ctx.importBusyReason()));
  ctx.state = { screen: 'home', mixed: false };
  assert.strictEqual(ctx.importBusyReason(), '');
  // testo del riepilogo
  var el = { innerHTML: '' };
  var r = { $: function () { return el; }, esc: function (s) { return String(s); }, gameName: function (t) { return t; }, importStep: null };
  vm.runInNewContext(extract(['importKindsHTML', 'importBackupHTML', 'renderImportDialog']), r);
  r.importStep = { kind: 'questions', name: 'domande.json', questions: [{ question: 'Q1' }, { question: 'Q2' }], before: 72, packTitle: 'Arte romana' };
  vm.runInNewContext('importStep=this.importStep;renderImportDialog()', r);
  assert.ok(/archivio domande/.test(el.innerHTML) && /2 domande/.test(el.innerHTML) && /72 domande/.test(el.innerHTML) && /Arte romana/.test(el.innerHTML));
  assert.ok(/data-imp="backup"/.test(el.innerHTML) && /data-imp="go"/.test(el.innerHTML) && /data-imp="cancel"/.test(el.innerHTML));
  r.importStep = { kind: 'pack', name: 'p.zip' };
  vm.runInNewContext('importStep=this.importStep;renderImportDialog()', r);
  assert.ok(/pacchetto completo/.test(el.innerHTML) && /libreria pacchetti/.test(el.innerHTML));
  assert.strictEqual(el.innerHTML.indexOf('data-imp="backup"'), -1, 'installare un pacchetto non sostituisce nulla: nessun backup richiesto');
});

/* ---------------- 4. classifica finale ---------------- */
function podiumCtx(teams, responses) {
  var s = SS.createSession({});
  s.rounds = [{ roundInstanceId: 'r1', committed: true }, { roundInstanceId: 'r2', committed: true }, { roundInstanceId: 'rx', committed: false }];
  s.responses = responses || [];
  var calls = [];
  var ctx = {
    RC: RC, SC: SC, calls: calls, BRAND_LOGO: 'logo.svg', Date: Date,
    state: { screen: 'home', teams: teams, session: s, finalReveal: null, roundResultsVisible: false, bank: [{ id: 'q1' }], qIndex: 0 },
    esc: function (x) { return String(x).replace(/</g, '&lt;'); }, pack: function () { return { title: 'Arte romana' }; },
    leaveQuestionGuard: function () { return true; }, stopTimer: function () {}, renderAll: function () { calls.push('render'); }, cloneAudio: function (n) { calls.push('sound:' + n); },
    showTransition: function (t) { calls.push('transition:' + t); }, autosave: function () {}, logEvent: function (e) { calls.push('log:' + e.event); }, arcadeEpoch: 0,
    planLive: function () { return null; }, planNext: function () {}
  };
  vm.runInNewContext('var arcadeEpoch=0;\n' + extract(['teamOutcomeStats', 'finalStandings', 'podiumInfo', 'revealNextPlace', 'revealAllPlaces', 'showLeaderboard', 'leaderboardHTML', 'nextQuestion']), ctx);
  return ctx;
}
var SIX = [{ id: 'a', name: 'Alfa', score: 500 }, { id: 'b', name: 'Beta', score: 475 }, { id: 'c', name: 'Gamma', score: 450 }, { id: 'd', name: 'Delta', score: 50 }, { id: 'e', name: 'Zeta', score: 0 }, { id: 'f', name: 'Eta', score: 0 }];

test('Classifica finale: posizioni con pari merito, esiti contati solo sui round confermati', function () {
  var ctx = podiumCtx(SIX, [
    { roundInstanceId: 'r1', participantId: 'a', outcome: 'correct' }, { roundInstanceId: 'r2', participantId: 'a', outcome: 'wrong' },
    { roundInstanceId: 'r1', participantId: 'e', outcome: 'omitted' }, { roundInstanceId: 'rx', participantId: 'a', outcome: 'correct' },
    { roundInstanceId: 'r2', participantId: 'a', outcome: 'correct', voided: true }
  ]);
  var rows = ctx.finalStandings();
  same(rows.map(function (r) { return r.name + ':' + r.rank + (r.tie ? 'T' : ''); }), ['Alfa:1', 'Beta:2', 'Gamma:3', 'Delta:4', 'Eta:5T', 'Zeta:5T']);
  same(rows[0].stats, { correct: 1, wrong: 1, omitted: 0 }, 'round non confermato e risposta annullata esclusi');
  same(rows.filter(function (r) { return r.id === 'e'; })[0].stats, { correct: 0, wrong: 0, omitted: 1 });
});

test('Classifica finale: AVANTI rivela una posizione alla volta dall\'ultima, il 1° per ultimo; poi AVANTI non fa altro', function () {
  var ctx = podiumCtx(SIX);
  ctx.showLeaderboard({ final: true });
  assert.strictEqual(ctx.state.screen, 'leaderboard');
  same(ctx.state.finalReveal.shown, 0);
  assert.ok(ctx.calls.indexOf('transition:CLASSIFICA FINALE') >= 0);
  var html = ctx.leaderboardHTML();
  assert.ok(/finalScene isIntro/.test(html) && /Ecco il verdetto/.test(html) && /si parte dal 5° posto/.test(html), 'schermata introduttiva');
  var seen = [];
  for (var i = 0; i < 6; i++) {
    ctx.nextQuestion();
    var h = ctx.leaderboardHTML();
    var open = (h.match(/class="finalCard(?! locked)[^"]*"/g) || []).length, locked = (h.match(/finalCard locked/g) || []).length;
    assert.strictEqual(open + locked, 6); assert.strictEqual(open, i + 1);
    assert.strictEqual((h.match(/ enter"/g) || []).length, 1, 'anima solo la carta appena rivelata');
    seen.push(ctx.podiumInfo().shown);
  }
  same(seen, [1, 2, 3, 4, 5, 6]);
  assert.ok(ctx.calls.indexOf('sound:final') > ctx.calls.lastIndexOf('sound:reveal'), 'suono finale per il 1° posto');
  assert.ok(ctx.calls.indexOf('log:leaderboard.final') >= 0);
  var before = ctx.calls.length;
  ctx.nextQuestion(); ctx.nextQuestion();
  assert.strictEqual(ctx.state.finalReveal.shown, 6, 'nessun passo oltre il 1°');
  assert.strictEqual(ctx.calls.length, before, 'AVANTI a verdetto completo non fa nulla');
  var done = ctx.leaderboardHTML();
  assert.ok(/finalCard podium p1/.test(done) && /ORO/.test(done) && /ARGENTO/.test(done) && /BRONZO/.test(done) && /EX AEQUO/.test(done) && /VERDETTO/.test(done));
});

test('Classifica finale: ★ CLASSIFICA a metà partita mostra subito tutto; MOSTRA TUTTO; molte squadre = podio 2–1–3; nomi protetti', function () {
  var ctx = podiumCtx(SIX);
  ctx.showLeaderboard({ type: 'click' }); // evento del pulsante: NON è la finale
  assert.strictEqual(ctx.state.finalReveal, null);
  var h = ctx.leaderboardHTML();
  assert.strictEqual((h.match(/finalCard locked/g) || []).length, 0);
  assert.ok(/<h1>CLASSIFICA<\/h1>/.test(h));
  ctx.showLeaderboard({ final: true }); ctx.revealNextPlace(); ctx.revealAllPlaces();
  assert.strictEqual(ctx.podiumInfo().shown, 6);
  var twelve = []; for (var i = 0; i < 12; i++) twelve.push({ id: 't' + i, name: i === 3 ? '<b>Squadra</b>' : 'Squadra ' + i, score: 1000 - i * 50 });
  var big = podiumCtx(twelve);
  big.showLeaderboard({ final: true }); big.revealAllPlaces();
  var hb = big.leaderboardHTML();
  assert.ok(/finalScene many/.test(hb) && /finalPodium/.test(hb) && /finalRest/.test(hb));
  var podium = hb.slice(hb.indexOf('finalPodium'), hb.indexOf('finalRest'));
  same((podium.match(/resultPos">(\d+)°/g) || []).map(function (x) { return x.replace(/\D/g, ''); }), ['2', '1', '3'], 'ordine 2–1–3');
  assert.ok(hb.indexOf('<b>Squadra</b>') < 0 && hb.indexOf('&lt;b>Squadra') >= 0, 'nome squadra protetto');
  var three = podiumCtx(SIX.slice(0, 3)); three.showLeaderboard({ final: true }); three.revealAllPlaces();
  assert.ok(/finalScene few/.test(three.leaderboardHTML()));
});

test('Regia one screen: durante la classifica finale l\'azione principale è RIVELA, con articolo corretto e ★ per il 1°', function () {
  var m = RC.cockpit({ screen: 'leaderboard', teams: 12, podium: { shown: 0, total: 12, nextRank: 11 } });
  same(m.main.map(function (x) { return x.act; }), ['revealNext']);
  assert.strictEqual(m.main[0].label, '▶ RIVELA L\'11° POSTO');
  assert.strictEqual(m.main[0].sub, '0 di 12 rivelati');
  same(m.secondary.map(function (x) { return x.act; }), ['revealAll']);
  assert.strictEqual(RC.cockpit({ screen: 'leaderboard', teams: 6, podium: { shown: 2, total: 6, nextRank: 4 } }).main[0].label, '▶ RIVELA IL 4° POSTO');
  var last = RC.cockpit({ screen: 'leaderboard', teams: 6, podium: { shown: 5, total: 6, nextRank: 1 } });
  assert.strictEqual(last.main[0].label, '★ RIVELA IL 1° POSTO'); assert.strictEqual(last.main[0].tone, 'amber');
  var done = RC.cockpit({ screen: 'leaderboard', teams: 6, podium: { shown: 6, total: 6, nextRank: 1 } });
  // RC1: a verdetto completo l'azione principale è TERMINA PARTITA (prima era HOME)
  same(done.main.map(function (x) { return x.act; }).concat(done.secondary.map(function (x) { return x.act; })), ['endGame', 'report', 'home']);
  same([RC.placeLabel(8), RC.placeLabel(80), RC.placeLabel(5), RC.placeFrom(11), RC.placeFrom(6)], ['L\'8° POSTO', 'L\'80° POSTO', 'IL 5° POSTO', 'dall\'11°', 'dal 6°']);
  var app = source('js/app.js');
  assert.ok(/revealNext:revealNextPlace,revealAll:revealAllPlaces/.test(app), 'azioni collegate alla regia');
  assert.ok(/showLeaderboard\(\{final:true\}\)/.test(app.slice(app.indexOf('function nextQuestion'), app.indexOf('function prevQuestion'))), 'fine archivio = classifica finale');
  assert.ok(/function planFinish\(\)[^\n]*showLeaderboard\(\{final:true\}\)/.test(app), 'fine scaletta = classifica finale');
  assert.ok(/finalReveal:state\.finalReveal\?\{shown:state\.finalReveal\.shown,lastAt:0\}:null,planRun/.test(app), 'il punto del reveal sopravvive al recovery');
});

test('Classifica finale: animazioni solo transform/opacity e movimento ridotto rispettato', function () {
  var css = source('css/show.css');
  ['finalCardIn', 'finalWinnerIn', 'finalShine', 'finalIntroIn'].forEach(function (k) {
    var m = new RegExp('@keyframes ' + k + '\\{((?:[^{}]*\\{[^{}]*\\})+)\\}').exec(css);
    assert.ok(m, 'keyframes ' + k);
    (m[1].match(/[a-z-]+(?=:)/g) || []).forEach(function (p) { assert.ok(p === 'transform' || p === 'opacity', k + ' anima ' + p); });
  });
  assert.ok(/prefers-reduced-motion:reduce\)\{\.finalCard\.enter/.test(css));
});
