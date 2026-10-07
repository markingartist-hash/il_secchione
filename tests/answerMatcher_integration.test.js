'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var test = require('./harness').test;
var AM = require('../js/engine/answerMatcher');
var PE = require('../js/engine/packs');
var C = require('../js/core');
var SC = require('../js/engine/scoring');
var SS = require('../js/engine/session');
var RoomModule = require('../server/room');
var H = require('./helpers');

function hostVM(type, raw) {
  var game = PE.validateGame(type, raw);
  var source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  var names = ['canEnter', 'pushHistory', 'entryOutcome', 'questionOutcome', 'ensureArcadeRound', 'setPending', 'applyTabletResponse', 'loadArcadePreset', 'arcadeSolution', 'arcadeAnswerReference', 'preserveAnswerVariants', 'arcadeTabletConfig', 'arcadeStartRound'];
  var code = names.map(function (name) {
    var start = source.indexOf('function ' + name + '(');
    assert.ok(start >= 0, 'funzione della regia: ' + name);
    var rest = source.slice(start);
    var next = /^function \w+\(/m.exec(rest.slice(rest.indexOf('\n') + 1));
    return next ? rest.slice(0, rest.indexOf('\n') + 1 + next.index) : rest;
  }).join('\n');
  var ctx = {
    C: C, AM: AM, SC: SC, SS: SS, TM: require('../js/engine/timer'), arcadeEpoch: 0,
    state: { teams: [{ id: 't', name: 'Uno' }], screen: 'arcade', packKey: 'fixture', arcade: { type: type }, round: null, pending: {}, pendingOrder: [], correctOrder: [], entryMeta: {}, entrySeq: 0, pendingHistory: [] },
    pack: function () { return { arcadeSets: sets }; }, stopTimer: function () {}, renderAll: function () {}, resetTimer: function () {}, toast: function () {}, afterEntryChange: function () {},
    clearPending: function () { ctx.state.pending = {}; ctx.state.pendingOrder = []; ctx.state.correctOrder = []; ctx.state.entryMeta = {}; },
    newRound: function (kind, extra) { ctx.state.round = Object.assign({ roundInstanceId: 'matcher-round', kind: kind }, extra); },
    logEvent: function (e) { ctx.logs.push(e); }, logs: [], sent: [], NET: { openRound: function (r) { ctx.sent.push(r); } }
  };
  var sets = {}; sets[type] = [game];
  vm.runInNewContext(code, ctx);
  ctx.loadArcadePreset(0, false);
  if (type === 'ghigliottina') ctx.state.arcade.final = true;
  ctx.arcadeStartRound();
  return ctx;
}

function record(answer, outcome) {
  return { roundInstanceId: 'matcher-round', participantId: 't', selectedAnswer: answer, outcome: outcome || 'wrong', correctAnswer: 'Caravaggio', responseId: 'response-1', responseTimeMs: 1234, receivedAt: '2026-10-04T12:00:00Z', deviceId: 'device-1', seq: 1 };
}

var base = { label: 'Test', theme: 'Arte', seconds: 30 };
var fixtures = {
  photopuzzle: Object.assign({}, base, { image: 'opera.jpg', answer: 'Caravaggio', acceptedAnswers: ['Michelangelo Merisi'] }),
  indovina: Object.assign({}, base, { subject: 'Caravaggio', candidates: ['Caravaggio', 'Caravaggi', 'Bernini'], clues: ['Un artista'], acceptedAnswers: ['Michelangelo Merisi'] }),
  ghigliottina: Object.assign({}, base, { answer: 'Caravaggio', pairs: [['a', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h'], ['m', 'n']], acceptedAnswers: ['Michelangelo Merisi'] }),
  chain: Object.assign({}, base, { links: [{ from: 'Pittore', to: 'Caravaggio', acceptedAnswers: ['Michelangelo Merisi'] }, { from: 'Caravaggio', to: 'Bernini', acceptedAnswers: ['Gian Lorenzo Bernini'] }] }),
  abbinamenti: Object.assign({}, base, { cards: [1, 2, 3, 4].map(function (n) { return { img: n + '.jpg' }; }), names: ['Uno', 'Due', 'Tre', 'Quattro'] })
};

Object.keys(fixtures).forEach(function (type) {
  test('matcher integrato: ' + type + ', riferimento del gioco e dati grezzi conservati', function () {
    var host = hostVM(type, fixtures[type]);
    var answer = type === 'abbinamenti' ? host.arcadeSolution(host.state.arcade) : 'Caravagio';
    var rec = record(answer);
    host.applyTabletResponse(rec);
    assert.strictEqual(host.state.pending.t, 'correct');
    assert.strictEqual(host.state.entryMeta.t.answerMatch.status, type === 'abbinamenti' ? 'exact' : 'fuzzy');
    assert.strictEqual(host.state.entryMeta.t.selectedAnswer, answer);
    assert.strictEqual(host.state.entryMeta.t.responseTimeMs, 1234);
    assert.strictEqual(host.state.entryMeta.t.inputMode, 'tablet');
    assert.deepStrictEqual(Object.keys(host.sent[0]).sort(), ['roundInstanceId', 'kind', 'gameType', 'questionId', 'layout', 'correct', 'maxLength', 'durationMs'].sort(), 'messaggio round.open invariato');
    assert.strictEqual(host.sent[0].acceptedAnswers, undefined, 'le varianti restano locali');
  });
});

test('matcher integrato: acceptedAnswers accettate in Photopuzzle, Indovina, finale e Staffetta', function () {
  ['photopuzzle', 'indovina', 'ghigliottina', 'chain'].forEach(function (type) {
    var host = hostVM(type, fixtures[type]);
    host.applyTabletResponse(record('La Michelangelo Merisi'));
    assert.strictEqual(host.state.pending.t, 'correct', type);
    assert.strictEqual(host.state.entryMeta.t.answerMatch.status, 'accepted_variant', type);
    assert.strictEqual(host.state.entryMeta.t.answerMatch.source, 'acceptedAnswers', type);
  });
});

test('matcher integrato: nella Staffetta le varianti appartengono al singolo collegamento', function () {
  var host = hostVM('chain', fixtures.chain);
  host.state.arcade.index = 1;
  host.applyTabletResponse(record('Michelangelo Merisi'));
  assert.strictEqual(host.state.pending.t, 'wrong', 'non accettare la soluzione del collegamento precedente');
  host.clearPending();
  host.applyTabletResponse(record('Gian Lorenzo Bernini'));
  assert.strictEqual(host.state.pending.t, 'correct');
});

test('matcher integrato: distrattori di Indovina e codici sbagliati di Abbinamenti restano errati', function () {
  var host = hostVM('indovina', fixtures.indovina);
  host.applyTabletResponse(record('Caravaggi', 'correct'));
  assert.strictEqual(host.state.pending.t, 'wrong');
  host = hostVM('abbinamenti', fixtures.abbinamenti);
  var answer = host.arcadeSolution(host.state.arcade).replace(/1[A-D]/, '1Z');
  host.applyTabletResponse(record(answer, 'correct'));
  assert.strictEqual(host.state.pending.t, 'wrong');
});

test('matcher integrato: correzione docente, replica tablet, ripresa e commit conservano l’esito manuale', function () {
  [
    { answer: 'Caravagio', manual: 'wrong', type: 'fuzzy' },
    { answer: 'Bernini', manual: 'correct', type: 'wrong' },
    { answer: 'Michelangelo Merisi', manual: 'wrong', type: 'accepted_variant' }
  ].forEach(function (row) {
    var host = hostVM('photopuzzle', fixtures.photopuzzle);
    var rec = record(row.answer);
    host.applyTabletResponse(rec);
    assert.strictEqual(host.state.entryMeta.t.answerMatch.status, row.type);
    // Gli stessi metadati mantenuti dai pulsanti di correzione già esistenti.
    host.setPending('t', row.manual, Object.assign({}, host.state.entryMeta.t));
    host.applyTabletResponse(rec);
    assert.strictEqual(host.state.pending.t, row.manual, 'la replica non annulla la correzione');
    var snapshot = JSON.parse(JSON.stringify(host.state));
    var resumed = hostVM('photopuzzle', fixtures.photopuzzle);
    Object.assign(resumed.state, snapshot);
    resumed.applyTabletResponse(rec);
    assert.strictEqual(resumed.state.pending.t, row.manual, 'correzione conservata dopo ripresa');
    var room = new RoomModule.Room();
    room.setSession('session-matcher');
    room.responses.push(Object.assign({}, rec, { kind: 'arcade', gameType: 'photopuzzle' }));
    var committed = room.commit({ roundInstanceId: rec.roundInstanceId, profileId: 'learning', records: [Object.assign({}, rec, { kind: 'arcade', gameType: 'photopuzzle', inputMode: 'tablet', outcome: row.manual })] });
    assert.strictEqual(committed.ok, true);
    assert.strictEqual(committed.records[0].outcome, row.manual, 'nessuna prevalenza del matcher sul docente');
    assert.strictEqual(committed.records[0].selectedAnswer, row.answer);
    assert.strictEqual(committed.records[0].responseTimeMs, 1234);
  });
});

test('matcher integrato: risposta registrata a mano non viene sovrascritta dal tablet', function () {
  var host = hostVM('photopuzzle', fixtures.photopuzzle);
  host.setPending('t', 'wrong', { inputMode: 'manual' });
  host.applyTabletResponse(record('Caravagio', 'correct'));
  assert.strictEqual(host.state.pending.t, 'wrong');
  assert.strictEqual(host.state.entryMeta.t.inputMode, 'manual');
});

test('matcher integrato: varianti sopravvivono a validazione, runtime ed export/import JSON', function () {
  ['photopuzzle', 'indovina', 'ghigliottina', 'chain'].forEach(function (type) {
    var game = PE.validateGame(type, fixtures[type]);
    var normalized = PE.normalizeGames({ games: (function () { var g = {}; g[type] = [game]; return g; })() });
    assert.deepStrictEqual(normalized.errors, []);
    var roundtrip = JSON.parse(JSON.stringify(normalized.games[type][0]));
    var actual = type === 'chain' ? roundtrip.links[0].acceptedAnswers : roundtrip.acceptedAnswers;
    assert.deepStrictEqual(actual, ['Michelangelo Merisi'], type);
    var source = JSON.parse(fs.readFileSync(path.join(__dirname, '../packs/arte_romana/pack.json'), 'utf8'));
    source.questions = JSON.parse(fs.readFileSync(path.join(__dirname, '../packs/arte_romana/questions.json'), 'utf8'));
    source.games = { games: normalized.games };
    var validated = PE.validatePack(source);
    assert.strictEqual(validated.ok, true, validated.errors.join('; '));
    var runtime = PE.toRuntime(validated.pack);
    actual = type === 'chain' ? runtime.arcadeSets[type][0].links[0].acceptedAnswers : runtime.arcadeSets[type][0].acceptedAnswers;
    assert.deepStrictEqual(actual, ['Michelangelo Merisi']);
  });
  assert.throws(function () { PE.validateGame('photopuzzle', Object.assign({}, fixtures.photopuzzle, { acceptedAnswers: 'Merisi' })); }, /acceptedAnswers/);
  assert.throws(function () { PE.validateGame('photopuzzle', Object.assign({}, fixtures.photopuzzle, { acceptedAnswers: [''] })); }, /Risposta accettata/);
  assert.throws(function () { PE.validateGame('chain', Object.assign({}, fixtures.chain, { acceptedAnswers: ['Merisi'] })); }, /collegamenti/);
});

test('matcher integrato: valutazione server comune, omesse e altri layout invariati', function () {
  assert.strictEqual(RoomModule.outcomeFor({ layout: 'text', correct: 'Il Colosseo' }, 'Colosseo'), 'correct');
  assert.strictEqual(RoomModule.outcomeFor({ layout: 'text', correct: 'Caravaggio' }, 'Caravagio'), 'correct');
  assert.strictEqual(RoomModule.outcomeFor({ layout: 'text', correct: 'Ratto di Proserpina' }, 'Ratto delle Sabine'), 'wrong');
  assert.strictEqual(RoomModule.outcomeFor({ layout: 'text', correct: 'Caravaggio', acceptedAnswers: ['Merisi'] }, 'Merisi'), 'correct');
  assert.strictEqual(RoomModule.outcomeFor({ layout: 'text', correct: 'Caravaggio' }, null), 'omitted');
  assert.strictEqual(RoomModule.outcomeFor({ layout: 'numeric', correct: '42' }, '42.0'), 'correct');
  assert.strictEqual(RoomModule.outcomeFor({ layout: 'mcq', correct: 'A' }, 'A'), 'correct');
  assert.strictEqual(RoomModule.outcomeFor({ layout: 'truefalse', correct: 'V' }, 'F'), 'wrong');
  assert.strictEqual(RoomModule.outcomeFor({ layout: 'buzzer', correct: null }, 'BUZZ'), 'omitted');
});

test('matcher integrato: modifica/copia di una manche conserva le varianti solo se la soluzione resta uguale', function () {
  var host = hostVM('indovina', fixtures.indovina);
  ['indovina', 'ghigliottina'].forEach(function (type) {
    var key = type === 'indovina' ? 'subject' : 'answer';
    var raw = { label: 'Nuovo titolo' }; raw[key] = 'CARAVAGGIO';
    host.preserveAnswerVariants(type, raw, fixtures[type]);
    assert.deepStrictEqual(raw.acceptedAnswers, ['Michelangelo Merisi']);
    assert.notStrictEqual(raw.acceptedAnswers, fixtures[type].acceptedAnswers, 'copia indipendente');
    raw = {}; raw[key] = 'Bernini';
    host.preserveAnswerVariants(type, raw, fixtures[type]);
    assert.strictEqual(raw.acceptedAnswers, undefined, 'non trasferire sinonimi a una soluzione diversa');
  });
  var chain = { links: [{ from: 'Artista', to: 'CARAVAGGIO' }, { from: 'Caravaggio', to: 'Borromini' }] };
  host.preserveAnswerVariants('chain', chain, fixtures.chain);
  assert.deepStrictEqual(chain.links[0].acceptedAnswers, ['Michelangelo Merisi']);
  assert.strictEqual(chain.links[1].acceptedAnswers, undefined);
});

test('matcher integrato: HTTP serve il modulo condiviso; flow tablet reale normalizza e tollera un typo', async function () {
  var app = await H.startServer();
  try {
    var file = await H.get(app.base + '/js/engine/answerMatcher.js');
    assert.strictEqual(file.status, 200);
    assert.strictEqual(file.body, fs.readFileSync(path.join(__dirname, '../js/engine/answerMatcher.js'), 'utf8'));
    var classroom = await H.classroom(app, 1);
    var cases = [['Il Colosseo', 'Colosseo', 'correct'], ["L'Ara Pacis", 'Ara Pacis', 'correct'], ['Caravaggio', 'Caravagio', 'correct'], ['Ratto di Proserpina', 'Ratto delle Sabine', 'wrong']];
    for (var i = 0; i < cases.length; i++) {
      var row = cases[i], id = 'matcher-network-' + i;
      classroom.host.sendJSON({ type: 'round.open', roundInstanceId: id, kind: 'arcade', gameType: 'photopuzzle', layout: 'text', correct: row[0], maxLength: 120, durationMs: 30000 });
      await classroom.players[0].waitFor(function (m) { return m.type === 'round' && m.round && m.round.roundInstanceId === id; }, 3000, true);
      classroom.players[0].sendJSON({ type: 'answer', roundInstanceId: id, answer: row[1], deviceToken: classroom.players[0].deviceToken });
      var response = await classroom.host.waitFor(function (m) { return m.type === 'response' && m.record && m.record.roundInstanceId === id; }, 3000, true);
      assert.strictEqual(response.record.outcome, row[2]);
      assert.strictEqual(response.record.selectedAnswer, row[1]);
    }
  } finally { await H.stopServer(app); }
});
