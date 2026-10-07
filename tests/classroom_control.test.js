'use strict';
/* v3.6.0 CLASSROOM CONTROL: modifica della domanda corrente, round aperto immutabile, annulla/ripeti, stato pulsantiere,
   progresso, ricerca nell'Archivio, acceptedAnswers in Pack Studio, Ghigliottina A/B sui tablet, recovery. */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var zlib = require('zlib');
var test = require('./harness.js').test;
var H = require('./helpers.js');
var RC = require('../js/engine/roundControl.js');
var AM = require('../js/engine/answerMatcher.js');
var PE = require('../js/engine/packs.js');
var PL = require('../js/engine/packlib.js');
var PS = require('../js/engine/packstudio.js');
var SS = require('../js/engine/session.js');
var disk = require('../server/packstore-disk.js');
var Room = require('../server/room.js').Room;

var ROOT = path.join(__dirname, '..');
function inflate(b) { return new Uint8Array(zlib.inflateRawSync(Buffer.from(b))); }

function q(id, correct, extra) {
  return Object.assign({ id: id, type: 'mcq', question: 'Domanda ' + id + '?', options: ['Uno', 'Due', 'Tre', 'Quattro'], correct: correct || 'B', explanation: 'Perché sì.', category: 'Arte', topic: 'Barocco', difficulty: 2, seconds: 30 }, extra || {});
}
function hostState() {
  var teams = [{ id: 't1', name: '2A', score: 300 }, { id: 't2', name: '2B', score: 0 }];
  return {
    screen: 'question', qIndex: 1, bank: [q('q1'), q('q2'), q('q3')], phase: 'preview', answerVisible: false, questionScored: false,
    qRound: { order: [2, 0, 3, 1], displayed: [2, 0, 3, 1].map(function (s, i) { return { letter: 'ABCD'[i], text: ['Uno', 'Due', 'Tre', 'Quattro'][s], sourceIndex: s }; }), correctDisplayLetter: 'D' },
    round: null, pending: {}, pendingOrder: [], correctOrder: [], pendingHistory: [], entryMeta: {}, entrySeq: 0, completedRounds: { q1: { roundInstanceId: 'r-q1' } },
    teams: teams, session: { scoreEvents: [{ roundInstanceId: 'r-q1', participantId: 't1', points: 300 }], responses: [{ roundInstanceId: 'r-q1' }] }, deferredEdits: {}
  };
}
function snapshotOf(s) { return JSON.stringify({ teams: s.teams, session: s.session, qIndex: s.qIndex }); }

/* ---------------- 1. modifica della domanda corrente ---------------- */
test('modifica domanda corrente in anteprima: stessa domanda, squadre e punteggi intatti, risposta corretta nuova', function () {
  var s = hostState();
  var before = snapshotOf(s);
  var edited = q('q2', 'C', { question: 'Domanda corretta?' });
  var r = RC.applyEdit(s, 1, edited, 'auto');
  assert.strictEqual(r.applied, true);
  assert.strictEqual(s.qIndex, 1);
  assert.strictEqual(s.screen, 'question');
  assert.strictEqual(snapshotOf(s), before, 'squadre, punteggi e sessione invariati');
  assert.strictEqual(s.bank[1].question, 'Domanda corretta?');
  assert.deepStrictEqual(s.qRound.order, [2, 0, 3, 1], 'stesso ordine delle alternative');
  assert.strictEqual(s.qRound.correctDisplayLetter, 'A', 'la C originale (indice 2) è mostrata come A');
  assert.strictEqual(s.qRound.displayed[0].text, 'Tre');
});

test('round aperto immutabile: "salva per dopo" non tocca il round, la modifica entra lasciando la domanda', function () {
  var s = hostState();
  s.phase = 'running'; s.round = { roundInstanceId: 'r-q2' }; s.pending = { t1: 'A' };
  var roundBefore = JSON.stringify(s.qRound);
  var r = RC.applyEdit(s, 1, q('q2', 'C'), 'later');
  assert.strictEqual(r.deferred, true);
  assert.strictEqual(s.bank[1].correct, 'B', 'il round in corso usa ancora la versione giocata');
  assert.strictEqual(JSON.stringify(s.qRound), roundBefore);
  assert.deepStrictEqual(s.pending, { t1: 'A' }, 'risposte del round non toccate');
  RC.applyDeferred(s);
  assert.strictEqual(s.bank[1].correct, 'C', 'applicata alla prossima apertura');
  assert.deepStrictEqual(s.deferredEdits, {});
});

test('"salva e riavvia": annulla solo il round corrente, anteprima della stessa domanda aggiornata, nessun punto', function () {
  var s = hostState();
  s.phase = 'running'; s.round = { roundInstanceId: 'r-q2' }; s.pending = { t1: 'A', t2: 'B' }; s.entryMeta = { t1: {} };
  var before = snapshotOf(s);
  var r = RC.applyEdit(s, 1, q('q2', 'D'), 'restart');
  assert.strictEqual(r.restarted, true);
  assert.strictEqual(r.cancelledRoundId, 'r-q2');
  assert.strictEqual(s.phase, 'preview');
  assert.strictEqual(s.round, null);
  assert.deepStrictEqual(s.pending, {});
  assert.strictEqual(s.qIndex, 1);
  assert.strictEqual(snapshotOf(s), before);
  assert.strictEqual(s.qRound.correctDisplayLetter, 'C', 'la D (indice 3) è in terza posizione: C');
});

/* ---------------- 2. annulla e ripeti ---------------- */
test('ANNULLA DOMANDA: risposte del round eliminate, nessun punto, sessione e squadre preservate', function () {
  var s = hostState();
  assert.strictEqual(RC.cancelRound(s).ok, false, 'in anteprima non c\'è nulla da annullare');
  s.phase = 'scoring'; s.round = { roundInstanceId: 'r-q2' }; s.pending = { t1: 'C' }; s.answerVisible = true;
  var before = snapshotOf(s);
  var r = RC.cancelRound(s);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.cancelledRoundId, 'r-q2');
  assert.deepStrictEqual(s.pending, {});
  assert.strictEqual(s.answerVisible, false);
  assert.strictEqual(s.phase, 'preview');
  assert.strictEqual(snapshotOf(s), before);
  assert.strictEqual(s.bank.length, 3, 'la domanda resta nel pacchetto');
});

test('RIPETI DOMANDA: nuovo round pulito, punti del primo tentativo invariati, marcato come ripetizione', function () {
  var s = hostState();
  s.qIndex = 0; s.questionScored = true; s.phase = 'scored'; s.answerVisible = true;
  s.pending = { t1: 'B' }; s.pendingOrder = ['t1']; s.correctOrder = ['t1']; s.entryMeta = { t1: { responseTimeMs: 1200 } };
  var before = snapshotOf(s);
  var r = RC.prepareRepeat(s);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.scoresKept, true);
  assert.strictEqual(s.repeatOf, 'r-q1');
  assert.strictEqual(s.phase, 'preview');
  assert.strictEqual(s.questionScored, false);
  assert.deepStrictEqual([s.pending, s.pendingOrder, s.correctOrder, s.entryMeta], [{}, [], [], {}], 'niente risposte, tempi o ordine precedenti');
  assert.strictEqual(snapshotOf(s), before, 'punteggi e sessione invariati');
  var s2 = hostState();
  assert.strictEqual(RC.prepareRepeat(s2).ok, false, 'una domanda mai giocata non si ripete');
});

/* ---------------- 3. pulsantiere, progresso, ricerca ---------------- */
test('stato pulsantiere: disconnessione e riconnessione aggiornano l\'indicatore senza eliminare squadre', function () {
  var teams = [{ id: 'a', name: '2A' }, { id: 'b', name: '2B' }, { id: 'c', name: '2C' }];
  var now = Date.parse('2026-10-05T10:00:30Z');
  var devs = { a: { connected: true }, b: { connected: true }, c: { connected: true } };
  assert.deepStrictEqual(RC.deviceSummary(teams, devs, now), { total: 3, connected: 3, disconnected: [], manual: 0 });
  devs.b = { connected: false, lastSeen: '2026-10-05T10:00:18Z' };
  var off = RC.deviceSummary(teams, devs, now);
  assert.strictEqual(off.connected, 2);
  assert.deepStrictEqual(off.disconnected, [{ id: 'b', name: '2B', lastSeen: '2026-10-05T10:00:18Z', agoSec: 12 }]);
  assert.strictEqual(teams.length, 3, 'la squadra non viene eliminata');
  devs.b.connected = true;
  assert.strictEqual(RC.deviceSummary(teams, devs, now).connected, 3);
  assert.strictEqual(RC.deviceSummary(teams.concat([{ id: 'd', name: 'Manuale' }]), devs, now).manual, 1, 'squadre senza tablet contate a parte');
});

test('progresso della sessione: domanda corrente, giocate e da giocare', function () {
  var bank = [q('a'), q('b'), q('c'), q('d')];
  assert.deepStrictEqual(RC.progress(bank, { a: {}, c: {} }, 2), { current: 3, total: 4, played: 2, toPlay: 2 });
  assert.deepStrictEqual(RC.progress([], {}, 0), { current: 0, total: 0, played: 0, toPlay: 0 });
});

test('ricerca nell\'Archivio: testo (accenti ignorati), spiegazione, argomento, difficoltà', function () {
  var bank = [
    q('a', 'A', { question: 'Chi dipinse la Vocazione di san Matteo?', options: ['Caravàggio', 'Bernini', 'Borromini', 'Raffaello'], topic: 'Pittura', difficulty: 3 }),
    q('b', 'A', { question: 'Chi progettò il baldacchino?', explanation: 'Gian Lorenzo Bernini lavorò anche con Caravaggio in mente.', topic: 'Scultura', difficulty: 2 }),
    q('c', 'A', { question: 'Che cos\'è la volta a botte?', topic: 'Architettura', difficulty: 1, tags: ['romani'] })
  ];
  assert.deepStrictEqual(RC.searchBank(bank, { text: 'caravaggio' }), [0, 1], 'testo, alternative e spiegazione');
  assert.deepStrictEqual(RC.searchBank(bank, { text: 'caravaggio', topic: 'Pittura' }), [0]);
  assert.deepStrictEqual(RC.searchBank(bank, { difficulty: '1' }), [2]);
  assert.deepStrictEqual(RC.searchBank(bank, { text: 'ROMANI' }), [2], 'tag');
  assert.deepStrictEqual(RC.searchBank(bank, {}), [0, 1, 2]);
  assert.deepStrictEqual(RC.bankFacets(bank).topics, ['Architettura', 'Pittura', 'Scultura']);
});

/* ---------------- 4. acceptedAnswers in Pack Studio ---------------- */
function studioDraft() {
  var d = PS.newDraft({ title: 'Barocco prova', subject: 'Arte', grade: 8 });
  var i = PS.addQuestion(d);
  Object.assign(d.questions[i], { question: 'Chi dipinse la Vocazione di san Matteo?', options: ['Caravaggio', 'Bernini', 'Borromini', 'Raffaello'], correct: 'A', explanation: 'Caravaggio.' });
  PS.addGame(d, 'ghigliottina');
  d.games.ghigliottina[0] = { label: 'Parola', theme: 'Barocco', seconds: 30, answer: 'Caravaggio', pairs: [['Luce', 'Neve'], ['Ombra', 'Sabbia'], ['Matteo', 'Marco'], ['Bacco', 'Giove'], ['Medusa', 'Venere']] };
  PS.addGame(d, 'chain');
  d.games.chain[0] = { label: 'Catena', theme: 'Barocco', seconds: 30, links: [{ from: 'Pittore', to: 'Caravaggio' }] };
  return d;
}

test('acceptedAnswers: crea, modifica, elimina; vuoti e doppioni (dopo normalizzazione) ignorati; principale distinta', function () {
  var d = studioDraft();
  var g = d.games.ghigliottina[0];
  g.acceptedAnswers = ['Michelangelo Merisi', '', 'caravàggio', 'Il Caravaggio', 'michelangelo merisi', 'Merisi'];
  var v = PS.validate(d);
  assert.strictEqual(v.ok, true, JSON.stringify(v.errors));
  assert.ok(v.warnings.some(function (w) { return /alternative vuote o doppie/.test(w.message); }), 'avviso nel Controllo');
  var full = PS.toFull(d);
  assert.deepStrictEqual(full.games.games.ghigliottina[0].acceptedAnswers, ['Michelangelo Merisi', 'Merisi'], 'vuoti, doppioni e copie della principale rimossi');
  g.acceptedAnswers[5] = 'M. Merisi';
  assert.deepStrictEqual(PS.toFull(d).games.games.ghigliottina[0].acceptedAnswers, ['Michelangelo Merisi', 'M. Merisi'], 'modifica');
  g.acceptedAnswers = ['', '  '];
  assert.ok(!('acceptedAnswers' in PS.toFull(d).games.games.ghigliottina[0]), 'elenco vuoto: campo omesso');
  d.games.chain[0].links[0].acceptedAnswers = ['Merisi', 'CARAVAGGIO'];
  assert.deepStrictEqual(PS.toFull(d).games.games.chain[0].links[0].acceptedAnswers, ['Merisi'], 'per singolo collegamento della Staffetta');
  assert.deepStrictEqual(RC.cleanAccepted('Caravaggio', ['caravaggio', 'Merisi', 'merisi', ''], AM.normalize), ['Merisi']);
});

test('acceptedAnswers sopravvivono a salva → riavvio → export ZIP → elimina → reimporta, e l\'answerMatcher le accetta', async function () {
  var dir = H.tempDir();
  var packsDir = path.join(dir, 'packs');
  fs.mkdirSync(packsDir);
  try {
    var d = studioDraft();
    d.games.ghigliottina[0].acceptedAnswers = ['Michelangelo Merisi'];
    d.games.chain[0].links[0].acceptedAnswers = ['Merisi'];
    var lib = disk.diskLibrary({ packsDir: packsDir, trashDir: path.join(dir, 'cestino') });
    assert.strictEqual((await lib.save('x.zip', PS.toZip(d).bytes, { mode: 'new', inflate: disk.inflate })).ok, true);
    var other = PS.newDraft({ title: 'Altro pacchetto' }); var oi = PS.addQuestion(other); Object.assign(other.questions[oi], { question: 'Altra?', options: ['a', 'b', 'c', 'd'], correct: 'A' });
    assert.strictEqual((await lib.save('o.zip', PS.toZip(other).bytes, { mode: 'new', inflate: disk.inflate })).ok, true);
    var lib2 = disk.diskLibrary({ packsDir: packsDir, trashDir: path.join(dir, 'cestino') }); // "riavvio"
    var ex = await lib2.exportZip(d.manifest.id);
    var raw = PL.readImport(ex.filename, ex.bytes, { inflate: inflate });
    var back = PL.validateImport(raw).pack;
    assert.deepStrictEqual(back.games.ghigliottina[0].acceptedAnswers, ['Michelangelo Merisi']);
    assert.deepStrictEqual(back.games.chain[0].links[0].acceptedAnswers, ['Merisi']);
    assert.strictEqual((await lib2.remove(d.manifest.id)).ok, true);
    var re = await lib2.importFile(ex.filename, ex.bytes, { inflate: disk.inflate });
    assert.strictEqual(re.ok, true, JSON.stringify(re.errors));
    var again = (await lib2.list()).filter(function (p) { return p.id === d.manifest.id; })[0].pack;
    assert.deepStrictEqual(again.games.ghigliottina[0].acceptedAnswers, ['Michelangelo Merisi'], 'dopo reimportazione');
    var gh = PE.validateGame('ghigliottina', again.games.ghigliottina[0]);
    var m = AM.answerMatcher('michelangelo merisi', { answer: gh.answer, acceptedAnswers: gh.acceptedAnswers });
    assert.strictEqual(m.isCorrect, true);
    assert.strictEqual(m.status, 'accepted_variant');
    // riapertura in Pack Studio: le alternative ci sono e restano modificabili
    var d2 = PS.draftFromImport(raw);
    assert.deepStrictEqual(d2.games.ghigliottina[0].acceptedAnswers, ['Michelangelo Merisi']);
  } finally { H.rmrf(dir); }
});

/* ---------------- 5. codice della regia (js/app.js) in sandbox ---------------- */
function extract(names) {
  var source = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  return names.map(function (name) {
    var start = source.indexOf('function ' + name + '(');
    assert.ok(start >= 0, 'funzione della regia: ' + name);
    var rest = source.slice(start);
    var next = /^function \w+\(/m.exec(rest.slice(rest.indexOf('\n') + 1));
    return next ? rest.slice(0, rest.indexOf('\n') + 1 + next.index) : rest;
  }).join('\n');
}

function runtimeBank(packDir) {
  var full = require('../tools/build_packs.js').loadPackFolder(packDir);
  var rt = PE.toRuntime(PE.validatePack(full).pack, { origin: 'installed' });
  return PL.composeBank([{ pack: rt, questions: rt.questions }]);
}

test('regia: MODIFICA DOMANDA salva nel pacchetto installato (non in un override); dopo riavvio ed export la modifica c\'è', async function () {
  var dir = H.tempDir();
  var packsDir = path.join(dir, 'packs');
  fs.mkdirSync(packsDir);
  try {
    // copia di lavoro del pack del programma
    (function copy(src, dst) { fs.mkdirSync(dst, { recursive: true }); fs.readdirSync(src).forEach(function (f) { var p = path.join(src, f); if (fs.statSync(p).isDirectory()) copy(p, path.join(dst, f)); else fs.copyFileSync(p, path.join(dst, f)); }); })(path.join(ROOT, 'packs/arte_romana'), path.join(packsDir, 'arte_romana'));
    var baseVersion = JSON.parse(fs.readFileSync(path.join(packsDir, 'arte_romana', 'pack.json'), 'utf8')).version;
    var lib = disk.diskLibrary({ packsDir: packsDir, trashDir: path.join(dir, 'cestino') });
    await lib.list();
    var bank = runtimeBank(path.join(packsDir, 'arte_romana'));
    var ctx = {
      PS: PS, PL: PL, state: { bank: bank, packKey: 'arte_romana' }, bankOverrides: {}, prefsSaved: 0,
      savePrefs: function () { ctx.prefsSaved++; }, refreshLibrary: function () { return Promise.resolve(true); },
      PKC: {
        openBytes: function (id) { return lib.exportZip(id).then(function (r) { return r.ok ? { ok: true, bytes: r.bytes, filename: r.filename } : r; }); },
        save: function (id, bytes, mode) { return lib.save(id + '.zip', bytes, { mode: mode, expectedId: id, inflate: disk.inflate }); }
      },
      Promise: Promise, Object: Object
    };
    vm.runInNewContext(extract(['editableFields', 'packQuestionsFromBank', 'savePackQuestions']), ctx);
    var x = JSON.parse(JSON.stringify(bank[16]));
    x.correct = x.correct === 'A' ? 'B' : 'A';
    x.question = 'Domanda 17 corretta in classe?';
    var r = await ctx.savePackQuestions('arte_romana', { question: ctx.editableFields(x) });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.where, 'pack', JSON.stringify(r));
    assert.deepStrictEqual(ctx.bankOverrides, {}, 'nessun override parallelo nel browser');
    var lib2 = disk.diskLibrary({ packsDir: packsDir, trashDir: path.join(dir, 'cestino') }); // chiusura e riapertura
    var ex = await lib2.exportZip('arte_romana');
    var pack = PL.validateImport(PL.readImport(ex.filename, ex.bytes, { inflate: inflate })).pack;
    var saved = pack.questions.filter(function (qq) { return qq.id === x.source.questionId; })[0];
    assert.strictEqual(saved.question, 'Domanda 17 corretta in classe?');
    assert.strictEqual(saved.correct, x.correct);
    assert.strictEqual(saved.sourcePage, bank[16].sourcePage, 'campi del pack conservati');
    assert.strictEqual(pack.questions.length, 72);
    assert.strictEqual(pack.version, PS.bumpVersion(baseVersion), 'versione aumentata');
    assert.ok(fs.readdirSync(path.join(dir, 'cestino')).some(function (n) { return /^arte_romana_.*_prima-della-modifica$/.test(n); }), 'copia di sicurezza');
    // pacchetto in sola lettura: resta la copia di questo browser, con avviso
    ctx.PKC.openBytes = function () { return Promise.resolve({ ok: false }); };
    var ro = await ctx.savePackQuestions('arte_romana', { question: ctx.editableFields(x) });
    assert.strictEqual(ro.where, 'browser');
    assert.strictEqual(ctx.bankOverrides.arte_romana.filter(function (qq) { return qq.question === 'Domanda 17 corretta in classe?'; }).length, 1);
  } finally { H.rmrf(dir); }
});

function controlCtx() {
  var s = hostState();
  var ctx = {
    RC: RC, state: s, sent: [], logs: [], toasts: [], confirmAnswer: true, timers: 0,
    NET: { closeRound: function (id) { ctx.sent.push(['close', id]); }, openRound: function (r) { ctx.sent.push(['open', r]); }, teamDevices: function () { return ctx.devices || {}; } },
    confirm: function () { return ctx.confirmAnswer; }, toast: function (m, k) { ctx.toasts.push([m, k]); }, logEvent: function (e) { ctx.logs.push(e); },
    stopTimer: function () { ctx.timers++; }, resetTimer: function () {}, renderAll: function () {}, autosave: function () {}, q: function () { return s.bank[s.qIndex]; },
    TM: { secondsFor: function () { return 30; } }, SS: SS, cloneAudio: function () {}, setTimeout: function () {}, arcadeEpoch: 0, commitQuestionScores: function () {}, fillMissingAbstain: function () {}, closeQuestionTime: function () {}
  };
  vm.runInNewContext(extract(['cancelRoundCore', 'cancelQuestion', 'repeatQuestion', 'leaveQuestionGuard']), ctx);
  return ctx;
}

test('regia: ANNULLA chiude il round anche sui tablet; RIPETI dopo i punti non chiude nulla e marca il nuovo round', function () {
  var c = controlCtx();
  c.state.phase = 'running'; c.state.round = { roundInstanceId: 'r-live' }; c.state.pending = { t1: 'A' };
  c.confirmAnswer = false;
  c.cancelQuestion();
  assert.strictEqual(c.state.phase, 'running', 'senza conferma non succede nulla');
  c.confirmAnswer = true;
  c.cancelQuestion();
  assert.deepStrictEqual(c.sent, [['close', 'r-live']]);
  assert.strictEqual(c.state.phase, 'preview');
  assert.ok(c.logs.some(function (e) { return e.event === 'round.cancel' && e.roundInstanceId === 'r-live'; }));
  assert.ok(/annullato/.test(c.toasts.pop()[0]));
  // ripetizione dopo i punti confermati
  var d = controlCtx();
  d.state.qIndex = 0; d.state.questionScored = true; d.state.phase = 'scored'; d.state.round = { roundInstanceId: 'r-q1', committed: true };
  d.repeatQuestion();
  assert.deepStrictEqual(d.sent, [], 'round già chiuso e confermato sul server');
  assert.strictEqual(d.state.repeatOf, 'r-q1');
  assert.strictEqual(d.state.session.scoreEvents.length, 1, 'punti del primo tentativo invariati');
});

test('regia: uscire da una domanda avviata senza risposte non lascia un round fantasma sui tablet', function () {
  var c = controlCtx();
  c.state.phase = 'running'; c.state.round = { roundInstanceId: 'r-ghost' };
  c.confirmAnswer = false;
  assert.strictEqual(c.leaveQuestionGuard(), false, 'navigazione bloccata senza conferma');
  assert.deepStrictEqual(c.sent, []);
  c.confirmAnswer = true;
  assert.strictEqual(c.leaveQuestionGuard(), true);
  assert.deepStrictEqual(c.sent, [['close', 'r-ghost']]);
  assert.strictEqual(c.state.round, null);
});

test('Ghigliottina su tablet: per ogni coppia un round A/B; voti contati; la maggioranza delle pulsantiere collegate sceglie', function () {
  var c = controlCtx();
  var a = { type: 'ghigliottina', started: true, final: false, step: 0, jackpot: 3200, pairs: [{ correct: 'Luce', wrong: 'Neve', a: 'Luce', b: 'Neve', correctSide: 'A', selected: null, resolved: false }, { correct: 'Ombra', wrong: 'Sabbia', a: 'Sabbia', b: 'Ombra', correctSide: 'B', selected: null, resolved: false }] };
  c.state.screen = 'arcade'; c.state.arcade = a; c.state.round = { roundInstanceId: 'r-gh', kind: 'arcade' };
  c.gameName = function () { return 'Parola Segreta'; };
  c.devices = { t1: { connected: true }, t2: { connected: true } };
  vm.runInNewContext(extract(['ghOpenPairRound', 'ghClosePairRound', 'ghVoteLabel', 'ghVote', 'chooseGh', 'applyTabletResponse']), c);
  c.ghOpenPairRound();
  var open = c.sent.filter(function (x) { return x[0] === 'open'; })[0][1];
  assert.strictEqual(open.layout, 'mcq');
  assert.strictEqual(JSON.stringify(open.letters), '["A","B"]');
  assert.strictEqual(open.correct, null, 'nessun esito comunicato al tablet: la scelta non dà punti');
  assert.strictEqual(open.kind, 'arcade');
  var rid = a.pairRoundId;
  c.applyTabletResponse({ roundInstanceId: rid, participantId: 't1', selectedAnswer: 'B', deviceId: 'd1' });
  assert.strictEqual(JSON.stringify(a.votes), '{"t1":"B"}');
  assert.strictEqual(a.pairs[0].selected, null, 'manca ancora una squadra');
  assert.strictEqual(c.ghVoteLabel(a, 'B'), ' · 1 voto');
  assert.deepStrictEqual(c.state.pending, {}, 'il voto non è una risposta da punteggio');
  c.applyTabletResponse({ roundInstanceId: rid, participantId: 't2', selectedAnswer: 'B', deviceId: 'd2' });
  assert.strictEqual(a.pairs[0].selected, 'B', 'maggioranza B');
  assert.deepStrictEqual(c.sent.filter(function (x) { return x[0] === 'close'; }).map(function (x) { return x[1]; }), [rid], 'voto chiuso sui tablet');
  assert.strictEqual(a.pairRoundId, null);
  // parità: decide il docente
  a.step = 1; c.ghOpenPairRound();
  var rid2 = a.pairRoundId;
  c.applyTabletResponse({ roundInstanceId: rid2, participantId: 't1', selectedAnswer: 'A' });
  c.applyTabletResponse({ roundInstanceId: rid2, participantId: 't2', selectedAnswer: 'B' });
  assert.strictEqual(a.pairs[1].selected, null);
  assert.ok(/Parità/.test(c.toasts.pop()[0]));
  c.chooseGh('B');
  assert.strictEqual(a.pairs[1].selected, 'B', 'il docente sceglie sempre');
});

/* ---------------- 6. server reale: annulla, A/B, connessioni, SHOW ---------------- */
test('server: dopo ANNULLA le risposte tardive sono rifiutate; il round rilanciato è pulito; voto A/B accettato senza esito', async function () {
  var app = await H.startServer();
  try {
    var c = await H.classroom(app, 2);
    var host = c.host;
    var p = c.players;
    host.sendJSON({ type: 'round.open', roundInstanceId: 'rnd-cancel-0001', questionId: 'q17', layout: 'mcq', letters: ['A', 'B', 'C', 'D'], correct: 'B', durationMs: 30000 });
    await p[0].waitFor(function (m) { return m.type === 'round' && m.round && m.round.roundInstanceId === 'rnd-cancel-0001'; }, 3000, true);
    p[0].sendJSON({ type: 'answer', roundInstanceId: 'rnd-cancel-0001', answer: 'B', deviceToken: p[0].deviceToken });
    await host.waitFor(function (m) { return m.type === 'response' && m.record.roundInstanceId === 'rnd-cancel-0001'; }, 3000, true);
    host.sendJSON({ type: 'round.close', roundInstanceId: 'rnd-cancel-0001' }); // ANNULLA DOMANDA
    await p[1].waitFor(function (m) { return m.type === 'round' && m.round && m.round.status === 'closed'; }, 3000, true);
    p[1].sendJSON({ type: 'answer', roundInstanceId: 'rnd-cancel-0001', answer: 'A', deviceToken: p[1].deviceToken });
    var late = await p[1].waitFor(function (m) { return m.type === 'ack'; }, 3000, true);
    assert.strictEqual(late.accepted, false);
    assert.strictEqual(late.reason, 'round_closed');
    // stessa domanda rilanciata: nuovo round, nessuna risposta precedente
    host.sendJSON({ type: 'round.open', roundInstanceId: 'rnd-cancel-0002', questionId: 'q17', layout: 'mcq', letters: ['A', 'B', 'C', 'D'], correct: 'C', durationMs: 30000 });
    var r2 = await p[0].waitFor(function (m) { return m.type === 'round' && m.round && m.round.roundInstanceId === 'rnd-cancel-0002'; }, 3000, true);
    assert.ok(!r2.round.myAnswer, 'nessuna risposta riportata dal round annullato');
    assert.strictEqual(app.room.round.responses ? Object.keys(app.room.round.responses).length : 0, 0);
    p[0].sendJSON({ type: 'answer', roundInstanceId: 'rnd-cancel-0002', answer: 'C', deviceToken: p[0].deviceToken });
    var resp = await host.waitFor(function (m) { return m.type === 'response' && m.record.roundInstanceId === 'rnd-cancel-0002'; }, 3000, true);
    assert.strictEqual(resp.record.outcome, 'correct', 'vale la risposta corretta aggiornata');
    // Ghigliottina: voto A/B sul tablet (stesso protocollo, nessun esito)
    host.sendJSON({ type: 'round.open', roundInstanceId: 'rnd-gh-pair-01', kind: 'arcade', gameType: 'ghigliottina', questionId: null, layout: 'mcq', letters: ['A', 'B'], correct: null, durationMs: 300000 });
    var gr = await p[1].waitFor(function (m) { return m.type === 'round' && m.round && m.round.roundInstanceId === 'rnd-gh-pair-01'; }, 3000, true);
    assert.deepStrictEqual(gr.round.letters, ['A', 'B'], 'il tablet mostra i tasti A e B');
    p[1].sendJSON({ type: 'answer', roundInstanceId: 'rnd-gh-pair-01', answer: 'B', deviceToken: p[1].deviceToken });
    var vote = await host.waitFor(function (m) { return m.type === 'response' && m.record.roundInstanceId === 'rnd-gh-pair-01'; }, 3000, true);
    assert.strictEqual(vote.record.selectedAnswer, 'B');
    assert.strictEqual(vote.record.outcome, 'omitted', 'nessun esito: la scelta della coppia non assegna punti');
    c.players.forEach(function (x) { x.close(); });
    host.close();
  } finally { await H.stopServer(app); }
});

test('server: pulsantiera disconnessa e riconnessa resta assegnata alla stessa squadra; lastSeen disponibile alla regia', async function () {
  var app = await H.startServer();
  try {
    var c = await H.classroom(app, 2);
    var token = c.players[1].deviceToken;
    c.players[1].destroy();
    var off = await c.host.waitFor(function (m) { return m.type === 'devices' && m.devices.some(function (d) { return d.participantId === 'team-1' && !d.connected; }); }, 4000);
    var d1 = off.devices.filter(function (d) { return d.participantId === 'team-1'; })[0];
    assert.ok(d1.lastSeen, 'ultimo contatto');
    assert.strictEqual(d1.status, 'assigned', 'la squadra non viene eliminata né liberata');
    var again = await H.ws.open(app.wsUrl);
    again.sendJSON({ type: 'hello', role: 'player', deviceToken: token });
    var w = await again.waitFor(function (m) { return m.type === 'welcome'; }, 3000, true);
    assert.strictEqual(w.reconnected, true);
    assert.strictEqual(w.participant.name, 'S2');
    await c.host.waitFor(function (m) { return m.type === 'devices' && m.devices.filter(function (d) { return d.participantId === 'team-1'; }).every(function (d) { return d.connected; }); }, 4000);
    // la vista per squadra usata dall'indicatore della regia (js/host/net.js)
    var net = fs.readFileSync(path.join(ROOT, 'js/host/net.js'), 'utf8');
    assert.ok(/m\.lastSeen = d\.lastSeen/.test(net), 'teamDevices espone lastSeen');
    again.close(); c.players[0].close(); c.host.close();
  } finally { await H.stopServer(app); }
});

test('recovery: lo SHOW che si ricollega riceve subito palco e timer correnti; la regia ritrova la partita salvata sul server', async function () {
  var dataDir = H.tempDir();
  var app = await H.startServer({ dataDir: dataDir });
  try {
    var c = await H.classroom(app, 1);
    c.host.sendJSON({ type: 'show.stage', html: '<div class="questionShow">DOMANDA 17</div>', meta: { title: 'Prova' } });
    c.host.sendJSON({ type: 'show.timer', timer: { running: false, remaining: 12, duration: 30, status: 'IN PAUSA', mood: 'welcome' } });
    await H.wait(100);
    var show = await H.ws.open(app.wsUrl);
    show.sendJSON({ type: 'hello', role: 'show' });
    var st = await show.waitFor(function (m) { return m.type === 'stage'; }, 3000, true);
    assert.ok(/DOMANDA 17/.test(st.html));
    var tm = await show.waitFor(function (m) { return m.type === 'timer'; }, 3000, true);
    assert.strictEqual(tm.timer.remaining, 12);
    // refresh della regia: istantanea salvata sul server e riletta (squadre, punteggi, domanda corrente)
    var snap = { format: 'secchione-snapshot', version: 1, app: '3.6.0', savedAt: new Date().toISOString(), session: SS.createSession({}), ui: { screen: 'question', qIndex: 16, phase: 'running', deferredEdits: {}, lockedQuestion: { id: 'arte_romana/rom017' } } };
    snap.session.participants = [{ id: 'team-0', name: 'S1', type: 'team' }];
    var hdr = { 'X-Secchione-Host': app.hostKey, 'Content-Type': 'application/json' };
    var http = require('http');
    await new Promise(function (resolve, reject) {
      var body = JSON.stringify(snap);
      var req = http.request({ host: '127.0.0.1', port: app.port, path: '/api/host/snapshot', method: 'POST', headers: Object.assign({ 'Content-Length': Buffer.byteLength(body) }, hdr) }, function (res) { res.resume(); res.on('end', resolve); });
      req.on('error', reject); req.end(body);
    });
    var got = await H.get(app.base + '/api/host/snapshot', { headers: hdr });
    var back = JSON.parse(got.body);
    assert.strictEqual(back.ui.qIndex, 16);
    assert.strictEqual(back.ui.lockedQuestion.id, 'arte_romana/rom017', 'la versione giocata del round aperto è nell\'istantanea');
    show.close(); c.players[0].close(); c.host.close();
  } finally { await H.stopServer(app); H.rmrf(dataDir); }
});
